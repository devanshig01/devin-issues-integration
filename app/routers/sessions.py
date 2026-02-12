import json
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

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


@router.get("/{session_id}/debug")
async def debug_session(session_id: int, db: AsyncSession = Depends(get_db)):
    """Return the raw Devin API response for debugging plan extraction."""
    result = await db.execute(
        select(DevinSession).where(DevinSession.id == session_id)
    )
    db_session = result.scalar_one_or_none()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not db_session.devin_session_id:
        raise HTTPException(status_code=400, detail="No Devin session ID")
    try:
        devin_data = await devin.get_session(db_session.devin_session_id)
        return {
            "db_plan": db_session.plan,
            "db_confidence": db_session.confidence,
            "db_status": db_session.status,
            "devin_status_enum": devin_data.get("status_enum"),
            "devin_structured_output": devin_data.get("structured_output"),
            "devin_structured_output_type": type(devin_data.get("structured_output")).__name__,
            "devin_messages_count": len(devin_data.get("messages", [])),
            "devin_messages": [
                {"role": m.get("role"), "message_preview": (m.get("message", "") or m.get("content", "") or m.get("text", ""))[:300]}
                for m in devin_data.get("messages", [])
            ],
            "devin_pull_request": devin_data.get("pull_request"),
            "devin_all_keys": list(devin_data.keys()),
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


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
        logger.info("Devin API response keys: %s", list(devin_data.keys()))
        logger.info("Devin status_enum: %s", devin_data.get("status_enum"))
        logger.info("Devin structured_output type: %s, value: %s",
                     type(devin_data.get("structured_output")).__name__,
                     repr(devin_data.get("structured_output"))[:500])

        status = devin_data.get("status_enum", db_session.status)
        if status == "blocked" and db_session.session_type == "scope":
            db_session.status = "finished"
        elif status == "finished":
            db_session.status = "finished"
        else:
            db_session.status = status

        structured = devin_data.get("structured_output")
        if structured and isinstance(structured, str):
            try:
                structured = json.loads(structured)
            except (json.JSONDecodeError, ValueError):
                db_session.plan = structured
                structured = None
        if structured and isinstance(structured, dict):
            plan_val = structured.get("plan", "")
            if plan_val:
                db_session.plan = plan_val
            conf_val = structured.get("confidence", "")
            if conf_val:
                db_session.confidence = conf_val
            pr_val = structured.get("pr_url", "")
            if pr_val:
                db_session.pr_url = pr_val

        if not db_session.plan:
            messages = devin_data.get("messages", [])
            logger.info("Messages count: %d", len(messages))
            if messages:
                logger.info("Last message keys: %s", list(messages[-1].keys()) if messages[-1] else "empty")
                logger.info("Last message role: %s", messages[-1].get("role", "N/A"))
            for msg in reversed(messages):
                role = msg.get("role", "")
                text = msg.get("message", "") or msg.get("content", "") or msg.get("text", "")
                if role in ("devin", "assistant") and text.strip():
                    db_session.plan = text.strip()
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
