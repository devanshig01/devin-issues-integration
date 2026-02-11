from typing import List

from fastapi import APIRouter, HTTPException

from app.schemas import GitHubIssue
from app.services import github

router = APIRouter(prefix="/issues", tags=["issues"])


@router.get("", response_model=List[GitHubIssue])
async def list_issues(state: str = "open"):
    try:
        raw_issues = await github.list_issues(state=state)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"GitHub API error: {exc}") from exc

    issues = []
    for raw in raw_issues:
        if "pull_request" in raw:
            continue
        issues.append(
            GitHubIssue(
                number=raw["number"],
                title=raw["title"],
                state=raw["state"],
                body=raw.get("body"),
                html_url=raw["html_url"],
                labels=[label["name"] for label in raw.get("labels", [])],
                created_at=raw["created_at"],
                updated_at=raw["updated_at"],
            )
        )
    return issues
