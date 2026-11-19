import os
import time
import jwt
import httpx
from typing import Optional, Dict, Tuple
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv()

APP_ID = os.getenv("GITHUB_APP_ID", "5523137")
WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "codeit_app_secret_123")
PRIVATE_KEY_PATH = os.getenv("GITHUB_APP_PRIVATE_KEY_PATH")

# Cache installation access tokens for 50 minutes (GitHub tokens expire after 60m)
_INSTALLATION_TOKEN_CACHE: Dict[str, Tuple[str, float]] = {}
_DEFAULT_INSTALLATION_ID: Optional[int] = None


def load_private_key() -> Optional[str]:
    """
    Loads the GitHub App RS256 private key from local path, Render Secret Files
    (/etc/secrets/...), or GITHUB_APP_PRIVATE_KEY environment variable.
    """
    candidates = []
    if PRIVATE_KEY_PATH:
        base_name = os.path.basename(PRIVATE_KEY_PATH)
        candidates.extend([
            PRIVATE_KEY_PATH,
            os.path.join(os.path.dirname(__file__), PRIVATE_KEY_PATH),
            f"/etc/secrets/{base_name}",
        ])
    candidates.extend([
        os.path.join(os.path.dirname(__file__), "github-app-private-key.pem"),
        os.path.join(os.getcwd(), "github-app-private-key.pem"),
        "/etc/secrets/github-app-private-key.pem",
    ])
    for path in candidates:
        if path and os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return content

    key_env = os.getenv("GITHUB_APP_PRIVATE_KEY")
    if key_env and key_env.strip():
        # Unescape literal \n sequences when pasted as a single-line Render env var
        return key_env.strip().replace("\\n", "\n")
    return None


def create_app_jwt(app_id: str = APP_ID, private_key: Optional[str] = None) -> str:
    """
    Creates an RS256 signed JWT for GitHub App authentication.
    Valid for 9 minutes (GitHub maximum is 10 minutes) with 60s clock drift buffer.
    """
    pem_key = private_key or load_private_key()
    if not pem_key:
        raise ValueError("GitHub App Private Key (.pem) is required to generate JWT.")

    now = int(time.time())
    payload = {
        "iat": now - 60,        # 60s in the past to compensate for clock drift
        "exp": now + (9 * 60),  # 9 minutes lifetime (safely under 10m limit)
        "iss": str(app_id)      # GitHub App ID
    }

    return jwt.encode(payload, pem_key, algorithm="RS256")


async def get_installation_access_token(installation_id: int, app_jwt: Optional[str] = None) -> str:
    """
    Exchanges the GitHub App JWT for a repository installation access token,
    using an in-memory 50-minute cache to avoid redundant token exchanges.
    """
    cache_key = str(installation_id)
    now = time.time()
    cached = _INSTALLATION_TOKEN_CACHE.get(cache_key)
    if cached and cached[1] > now:
        return cached[0]

    jwt_token = app_jwt or create_app_jwt()
    headers = {
        "Authorization": f"Bearer {jwt_token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "CodeIt-GitHub-App"
    }

    url = f"https://api.github.com/app/installations/{installation_id}/access_tokens"
    async with httpx.AsyncClient(headers=headers, timeout=15.0) as client:
        res = await client.post(url)
        res.raise_for_status()
        token = res.json()["token"]
        _INSTALLATION_TOKEN_CACHE[cache_key] = (token, now + 3000)  # 50 min TTL
        return token


async def get_default_installation_id(app_jwt: Optional[str] = None) -> Optional[int]:
    """
    Finds the first active installation_id for this GitHub App so public repo fetches
    can authenticate at 5,000 req/hr instead of Render's 60 req/hr shared-IP limit.
    """
    global _DEFAULT_INSTALLATION_ID
    if _DEFAULT_INSTALLATION_ID:
        return _DEFAULT_INSTALLATION_ID

    jwt_token = app_jwt or create_app_jwt()
    headers = {
        "Authorization": f"Bearer {jwt_token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "CodeIt-GitHub-App"
    }
    async with httpx.AsyncClient(headers=headers, timeout=15.0) as client:
        res = await client.get("https://api.github.com/app/installations")
        if res.status_code == 200:
            installations = res.json()
            if isinstance(installations, list) and len(installations) > 0:
                _DEFAULT_INSTALLATION_ID = installations[0].get("id")
                return _DEFAULT_INSTALLATION_ID
    return None


async def resolve_github_auth_token(installation_id: Optional[int] = None) -> Optional[str]:
    """
    Resolves the best available GitHub token:
    1. Explicit GitHub App installation token (if installation_id provided and private key exists)
    2. Static GITHUB_TOKEN from environment (if configured)
    3. Auto-discovered GitHub App installation token (raises rate limit from 60/hr to 5000/hr)
    """
    has_key = load_private_key() is not None

    if installation_id and has_key:
        try:
            return await get_installation_access_token(installation_id)
        except Exception as e:
            print(f"Warning: Failed to fetch installation token for {installation_id}: {e}")

    gh_pat = os.getenv("GITHUB_TOKEN")
    if gh_pat and gh_pat.strip():
        return gh_pat.strip()

    if has_key:
        try:
            default_inst_id = await get_default_installation_id()
            if default_inst_id:
                return await get_installation_access_token(default_inst_id)
        except Exception as e:
            print(f"Warning: Auto-discovery of GitHub App installation token failed: {e}")

    return None
