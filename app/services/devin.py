from typing import Any, Dict

import httpx

from app.config import settings

DEVIN_API_BASE = "https://api.devin.ai/v1"


async def create_session(
    prompt: str,
    structured_outputs: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    url = f"{DEVIN_API_BASE}/sessions"
    headers = {
        "Authorization": f"Bearer {settings.devin_api_token}",
        "Content-Type": "application/json",
    }
    payload: Dict[str, Any] = {"prompt": prompt}
    if structured_outputs is not None:
        payload["structured_outputs"] = structured_outputs
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        return resp.json()


async def get_session(session_id: str) -> Dict[str, Any]:
    url = f"{DEVIN_API_BASE}/sessions/{session_id}"
    headers = {
        "Authorization": f"Bearer {settings.devin_api_token}",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.json()
