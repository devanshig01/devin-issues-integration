from typing import Any, Dict, List

import httpx

from app.config import settings

GITHUB_API_BASE = "https://api.github.com"


async def list_issues(state: str = "open") -> List[Dict[str, Any]]:
    owner, repo = settings.github_repo.split("/")
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/issues"
    headers = {
        "Authorization": f"Bearer {settings.github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    params = {"state": state, "per_page": 30}
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        return resp.json()


async def get_issue(issue_number: int) -> Dict[str, Any]:
    owner, repo = settings.github_repo.split("/")
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/issues/{issue_number}"
    headers = {
        "Authorization": f"Bearer {settings.github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.json()
