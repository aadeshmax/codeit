import os
import httpx
from urllib.parse import urlparse
from schemas import CodeItState
from agents import classify_files_with_8b

IGNORE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".lock", ".md", ".txt", ".ico", ".pdf", ".min.js", ".yaml", ".yml", ".toml", ".ini", ".json")
IGNORE_DIRS = ("node_modules/", "venv/", ".git/", "dist/", "build/", "__pycache__/", ".github/")
CODE_EXT = (".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java", ".cpp", ".c", ".h", ".cs", ".php", ".rb")

async def github_fetcher_node(state: CodeItState):
    path_parts = urlparse(state["repo_url"]).path.strip("/").split("/")
    if len(path_parts) < 2:
        raise ValueError("Invalid GitHub repository URL")
    owner, repo = path_parts[0], path_parts[1].replace(".git", "")

    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "CodeIt-Backend"
    }
    gh_token = os.getenv("GITHUB_TOKEN")
    if gh_token:
        headers["Authorization"] = f"Bearer {gh_token}"

    async with httpx.AsyncClient(headers=headers, timeout=15.0) as client:
        repo_res = await client.get(f"https://api.github.com/repos/{owner}/{repo}")
        repo_res.raise_for_status()
        branch = repo_res.json().get("default_branch", "main")

        tree_res = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
        )
        tree_data = tree_res.json().get("tree", [])
        all_files = [item["path"] for item in tree_data if item["type"] == "blob"]

        candidate_files = [
            f for f in all_files
            if f.endswith(CODE_EXT) and not any(d in f for d in IGNORE_DIRS)
        ]
        if not candidate_files:
            candidate_files = [
                f for f in all_files
                if not f.endswith(IGNORE_EXT) and not any(d in f for d in IGNORE_DIRS) and not f.startswith(".")
            ]

        # Use 8B model to intelligently classify and select the most critical files
        code_files = await classify_files_with_8b(candidate_files)

        chunks = ["DIRECTORY STRUCTURE:\n" + "\n".join(all_files[:35]) + "\n\nKEY SOURCE FILES WITH LINE NUMBERS:"]
        for file_path in code_files:
            raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file_path}"
            raw_res = await client.get(raw_url)
            if raw_res.status_code == 200:
                raw_lines = raw_res.text.splitlines()[:120]
                numbered = [f"{i+1:4d} | {l}" for i, l in enumerate(raw_lines)]
                chunks.append(f"\n--- FILE: {file_path} ---\n" + "\n".join(numbered))

    return {
        "code_context": "\n".join(chunks),
        "selected_files": code_files
    }
