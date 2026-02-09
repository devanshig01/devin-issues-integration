from datetime import datetime

from pydantic import BaseModel


class GitHubIssue(BaseModel):
    number: int
    title: str
    state: str
    body: str | None = None
    html_url: str
    labels: list[str] = []
    created_at: str
    updated_at: str


class ScopeRequest(BaseModel):
    issue_number: int


class ImplementRequest(BaseModel):
    scope_session_id: int


class SessionResponse(BaseModel):
    id: int
    issue_number: int
    issue_title: str
    session_type: str
    devin_session_id: str | None = None
    devin_session_url: str | None = None
    status: str
    plan: str | None = None
    confidence: str | None = None
    pr_url: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
