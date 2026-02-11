from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class GitHubIssue(BaseModel):
    number: int
    title: str
    state: str
    body: Optional[str] = None
    html_url: str
    labels: List[str] = []
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
    devin_session_id: Optional[str] = None
    devin_session_url: Optional[str] = None
    status: str
    plan: Optional[str] = None
    confidence: Optional[str] = None
    pr_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
