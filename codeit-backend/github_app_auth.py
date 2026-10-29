import os
import time
import jwt
import httpx
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

APP_ID = os.getenv("GITHUB_APP_ID", "5523137")
WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "codeit_app_secret_123")
PRIVATE_KEY_PATH = os.getenv("GITHUB_APP_PRIVATE_KEY_PATH")

def load_private_key() -> Optional[str]:
    """Loads the GitHub App RS256 private key from file or env."""
    if PRIVATE_KEY_PATH and os.path.exists(PRIVATE_KEY_PATH):
        with open(PRIVATE_KEY_PATH, "r", encoding="utf-8") as f:
            return f.read().strip()
    key_env = os.getenv("GITHUB_APP_PRIVATE_KEY")
    if key_env:
        return key_env.strip()
    return None

def create_app_jwt(app_id: str = APP_ID, private_key: Optional[str] = None) -> str:
    """
    Creates an RS256 signed JWT for GitHub App authentication.
    Valid for 10 minutes as required by GitHub API.
    """
    pem_key = private_key or load_private_key()
    if not pem_key:
        raise ValueError("GitHub App Private Key (.pem) is required to generate JWT.")

    now = int(time.time())
    payload = {
        "iat": now - 60,       # 60s in the past to compensate for clock drift
        "exp": now + (10 * 60),# 10 minutes maximum lifetime
        "iss": str(app_id)     # GitHub App ID
    }

    token = jwt.encode(payload, pem_key, algorithm="RS256")
    return token

async def get_installation_access_token(installation_id: int, app_jwt: Optional[str] = None) -> str:
    """
    Exchanges the GitHub App JWT for a repository installation access token.
    """
    jwt_token = app_jwt or create_app_jwt()
    headers = {
        "Authorization": f"Bearer {jwt_token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "CodeIt-GitHub-App"
    }

    url = f"https://api.github.com/app/installations/{installation_id}/access_tokens"
    async with httpx.AsyncClient(headers=headers, timeout=15.0) as client:
        res = await client.post(url)
        res.raise_for_status()
        return res.json()["token"]

async def resolve_github_auth_token(installation_id: Optional[int] = None) -> Optional[str]:
    """
    Resolves the best available GitHub token:
    1. GitHub App installation token (if installation_id and private key exist)
    2. Static GITHUB_TOKEN from environment (fallback)
    """
    if installation_id and load_private_key():
        try:
            return await get_installation_access_token(installation_id)
        except Exception as e:
            print(f"Warning: Failed to fetch installation token for {installation_id}: {e}")
    
    return os.getenv("GITHUB_TOKEN")

