from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import DevinSession
from app.schemas import ImplementRequest, ScopeRequest, SessionResponse
from app.services import devin, github

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=List[SessionResponse])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DevinSession).order_by(DevinSession.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DevinSession).where(DevinSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/scope", response_model=SessionResponse)
async def create_scope_session(
    req: ScopeRequest, db: AsyncSession = Depends(get_db)
):
    try:
        issue = await github.get_issue(req.issue_number)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Failed to fetch issue: {exc}"
        ) from exc

    prompt = (
        f"Analyze the following GitHub issue from {settings.github_repo} and create a detailed "
        f"implementation plan. Include step-by-step instructions and a confidence score "
        f"(low/medium/high) for successful implementation.\n\n"
        f"Issue #{issue['number']}: {issue['title']}\n\n"
        f"{issue.get('body', 'No description provided.')}\n\n"
        f"Respond with:\n"
        f"1. A clear implementation plan\n"
        f"2. Confidence level (low/medium/high)\n"
        f"Do NOT implement the changes - only provide the plan.\n\n"
        f"IMPORTANT: Please update the structured output with this JSON format "
        f"whenever you have results:\n"
        f'{{"plan": "your detailed step-by-step plan here", '
        f'"confidence": "low/medium/high"}}'
    )

    db_session = DevinSession(
        issue_number=req.issue_number,
        issue_title=issue["title"],
        session_type="scope",
        status="creating",
    )
    db.add(db_session)
    await db.commit()
    await db.refresh(db_session)

    try:
        devin_resp = await devin.create_session(prompt)
        db_session.devin_session_id = devin_resp.get("session_id", "")
        db_session.devin_session_url = devin_resp.get("url", "")
        db_session.status = "running"
        await db.commit()
        await db.refresh(db_session)
    except Exception as exc:
        db_session.status = "failed"
        await db.commit()
        raise HTTPException(
            status_code=502, detail=f"Failed to create Devin session: {exc}"
        ) from exc

    return db_session


@router.post("/implement", response_model=SessionResponse)
async def create_implement_session(
    req: ImplementRequest, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(DevinSession).where(DevinSession.id == req.scope_session_id)
    )
    scope_session = result.scalar_one_or_none()
    if not scope_session:
        raise HTTPException(status_code=404, detail="Scope session not found")
    if scope_session.session_type != "scope":
        raise HTTPException(
            status_code=400, detail="Referenced session is not a scope session"
        )

    plan_text = scope_session.plan or "No plan available yet from the scope session."

    prompt = (
        f"Implement the following plan for GitHub issue #{scope_session.issue_number} "
        f"in the repository {settings.github_repo}. "
        f"Create a pull request with the changes.\n\n"
        f"Issue: {scope_session.issue_title}\n\n"
        f"Implementation Plan:\n{plan_text}\n\n"
        f"Please implement this plan and open a PR."
    )

    db_session = DevinSession(
        issue_number=scope_session.issue_number,
        issue_title=scope_session.issue_title,
        session_type="implement",
        status="creating",
        plan=plan_text,
    )
    db.add(db_session)
    await db.commit()
    await db.refresh(db_session)

    try:
        devin_resp = await devin.create_session(prompt)
        db_session.devin_session_id = devin_resp.get("session_id", "")
        db_session.devin_session_url = devin_resp.get("url", "")
        db_session.status = "running"
        await db.commit()
        await db.refresh(db_session)
    except Exception as exc:
        db_session.status = "failed"
        await db.commit()
        raise HTTPException(
            status_code=502, detail=f"Failed to create Devin session: {exc}"
        ) from exc

    return db_session


@router.post("/{session_id}/refresh", response_model=SessionResponse)
async def refresh_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DevinSession).where(DevinSession.id == session_id)
    )
    db_session = result.scalar_one_or_none()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not db_session.devin_session_id:
        raise HTTPException(
            status_code=400, detail="No Devin session ID to refresh"
        )

    try:
        devin_data = await devin.get_session(db_session.devin_session_id)
        db_session.status = devin_data.get("status_enum", db_session.status)

        structured = devin_data.get("structured_output")
        if structured:
            if isinstance(structured, dict):
                db_session.plan = structured.get("plan", db_session.plan)
                db_session.confidence = structured.get(
                    "confidence", db_session.confidence
                )
                db_session.pr_url = structured.get("pr_url", db_session.pr_url)
            elif isinstance(structured, str):
                db_session.plan = structured

        if not db_session.plan:
            messages = devin_data.get("messages", [])
            for msg in reversed(messages):
                if msg.get("role") == "devin" and msg.get("message", "").strip():
                    db_session.plan = msg["message"].strip()
                    break

        pr_info = devin_data.get("pull_request")
        if pr_info and isinstance(pr_info, dict):
            pr_url = pr_info.get("url", "")
            if pr_url:
                db_session.pr_url = pr_url

        await db.commit()
        await db.refresh(db_session)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Failed to refresh session: {exc}"
        ) from exc

    return db_session
