import httpx
from urllib.parse import urlparse
from schemas import CodeItState
from agents import classify_files_with_8b
from github_app_auth import resolve_github_auth_token

IGNORE_EXT = (
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".lock", ".md", ".txt",
    ".ico", ".pdf", ".min.js", ".min.css", ".map", ".yaml", ".yml",
    ".toml", ".ini", ".json", ".woff", ".woff2", ".ttf", ".eot"
)
IGNORE_DIRS = (
    "node_modules/", "venv/", ".venv/", ".git/", "dist/", "build/",
    "__pycache__/", ".github/", "coverage/", "vendor/"
)
LOW_PRIORITY_DIRS = ("docs/", "doc/", "examples/", "example/", "tests/", "test/", "bench/")
CODE_EXT = (
    ".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs",
    ".java", ".cpp", ".c", ".h", ".cs", ".php", ".rb"
)

# Strict Token & Context Window Budget Controls:
# Keeps total code_context <= ~14,000 chars (~3,500 tokens) so parallel
# Level-2 120B calls (Security + Architecture) stay well below Groq's TPM cap.
MAX_LINES_PER_FILE = 100
MAX_CHARS_PER_LINE = 200
MAX_CHARS_PER_FILE = 2800
MAX_TOTAL_CONTEXT_CHARS = 14000


async def _github_get_with_fallback(
    client: httpx.AsyncClient,
    url: str,
    auth_headers: dict,
    base_headers: dict
) -> httpx.Response:
    """
    Performs a GitHub GET request with authentication headers; if an invalid/expired
    token causes 401/403 on a public repo, retries once without Authorization.
    """
    res = await client.get(url, headers=auth_headers)
    if res.status_code in (401, 403) and "Authorization" in auth_headers:
        retry_res = await client.get(url, headers=base_headers)
        if retry_res.status_code == 200:
            return retry_res
    return res


async def github_fetcher_node(state: CodeItState):
    repo_url = (state.get("repo_url") or "").strip()
    parsed = urlparse(repo_url)
    path_parts = [p for p in parsed.path.strip("/").split("/") if p]
    if "github.com" not in parsed.netloc.lower() or len(path_parts) < 2:
        raise ValueError("Invalid GitHub repository URL")
    owner, repo = path_parts[0], path_parts[1].replace(".git", "")

    base_headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "CodeIt-Backend"
    }
    auth_headers = dict(base_headers)

    # Resolve GitHub App Installation Token (5,000 req/hr) or GITHUB_TOKEN PAT
    gh_token = await resolve_github_auth_token(state.get("installation_id"))
    if gh_token:
        auth_headers["Authorization"] = f"Bearer {gh_token}"

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        repo_res = await _github_get_with_fallback(
            client,
            f"https://api.github.com/repos/{owner}/{repo}",
            auth_headers,
            base_headers
        )
        repo_res.raise_for_status()
        branch = repo_res.json().get("default_branch", "main")

        tree_res = await _github_get_with_fallback(
            client,
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1",
            auth_headers,
            base_headers
        )
        tree_res.raise_for_status()
        tree_data = tree_res.json().get("tree", [])
        all_files = [item["path"] for item in tree_data if item.get("type") == "blob"]

        candidate_files = [
            f for f in all_files
            if f.endswith(CODE_EXT)
            and not f.endswith((".min.js", ".bundle.js"))
            and not any(d in f for d in IGNORE_DIRS)
        ]
        # Prioritize core application files over docs/examples/tests
        primary_candidates = [
            f for f in candidate_files
            if not f.startswith(LOW_PRIORITY_DIRS) and not any(f"/{d}" in f for d in LOW_PRIORITY_DIRS)
        ]
        secondary_candidates = [f for f in candidate_files if f not in primary_candidates]
        ordered_candidates = primary_candidates + secondary_candidates

        if not ordered_candidates:
            ordered_candidates = [
                f for f in all_files
                if not f.endswith(IGNORE_EXT)
                and not any(d in f for d in IGNORE_DIRS)
                and not f.startswith(".")
            ]

        # Level 1: Use 8B model to intelligently classify and select critical files
        code_files = await classify_files_with_8b(ordered_candidates)

        header_chunk = (
            "DIRECTORY STRUCTURE:\n"
            + "\n".join(all_files[:35])
            + "\n\nKEY SOURCE FILES WITH LINE NUMBERS:"
        )
        chunks = [header_chunk]
        total_chars = len(header_chunk)

        for file_path in code_files:
            if total_chars >= MAX_TOTAL_CONTEXT_CHARS:
                break

            raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file_path}"
            raw_res = await _github_get_with_fallback(client, raw_url, auth_headers, base_headers)
            if raw_res.status_code == 200 and raw_res.text:
                raw_lines = raw_res.text.splitlines()[:MAX_LINES_PER_FILE]
                numbered = []
                file_char_count = 0
                for i, line in enumerate(raw_lines):
                    # Cap individual line length to block minified/base64 single-line token bombs
                    clipped_line = (
                        line[:MAX_CHARS_PER_LINE] + " ... [truncated]"
                        if len(line) > MAX_CHARS_PER_LINE
                        else line
                    )
                    formatted_line = f"{i+1:4d} | {clipped_line}"
                    if file_char_count + len(formatted_line) > MAX_CHARS_PER_FILE:
                        numbered.append(f" ... | [File truncated at {MAX_CHARS_PER_FILE} chars for token budget]")
                        break
                    numbered.append(formatted_line)
                    file_char_count += len(formatted_line) + 1

                file_block = f"\n--- FILE: {file_path} ---\n" + "\n".join(numbered)
                remaining_budget = MAX_TOTAL_CONTEXT_CHARS - total_chars
                if len(file_block) > remaining_budget:
                    file_block = file_block[:remaining_budget] + "\n... [Context budget limit reached]"
                chunks.append(file_block)
                total_chars += len(file_block)

    return {
        "code_context": "\n".join(chunks),
        "selected_files": code_files
    }
