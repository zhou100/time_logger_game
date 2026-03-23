"""
/api/v1/ws — WebSocket endpoint for real-time entry status updates.

Connect with: ws://host/api/v1/ws?token=<access_token>

Server pushes:
  { "type": "entry.classified", "entry_id": "...", "transcript": "...", "category": "..." }
  { "type": "entry.failed",     "entry_id": "...", "error": "..." }
  { "type": "stats.updated",    "total_entries": N, "current_streak": N, "level": N, "xp": N }
  { "type": "streak.extended",  "streak": N }
  { "type": "level_up",         "old_level": N, "new_level": N }

The worker imports `manager` from this module to push events after processing.
"""
import json
import logging
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from jose import jwt, JWTError
from sqlalchemy import select

from ...settings import settings
from ...db import get_db, async_session
from ...models.user import User

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)


class ConnectionManager:
    """In-memory WebSocket connection registry, keyed by user_id."""

    def __init__(self):
        self._connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.setdefault(user_id, set()).add(ws)
        logger.info(f"WebSocket connected: user_id={user_id} total={len(self._connections.get(user_id, set()))}")

    def disconnect(self, user_id: int, ws: WebSocket) -> None:
        sockets = self._connections.get(user_id, set())
        sockets.discard(ws)
        if not sockets:
            self._connections.pop(user_id, None)
        logger.info(f"WebSocket disconnected: user_id={user_id}")

    async def send_to_user(self, user_id: int, message: dict) -> None:
        """Push a JSON message to all connections for a user."""
        text = json.dumps(message)
        dead: Set[WebSocket] = set()
        for ws in list(self._connections.get(user_id, set())):
            try:
                await ws.send_text(text)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.disconnect(user_id, ws)


manager = ConnectionManager()


async def _authenticate(token: str) -> int | None:
    """Return user_id from a valid access token, or None."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "access":
            return None
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="Valid access token"),
):
    user_id = await _authenticate(token)
    if user_id is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await manager.connect(user_id, websocket)
    try:
        # Server-push only; we still need to receive to detect disconnects
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception as exc:
        logger.debug(f"WebSocket error user_id={user_id}: {exc}")
        manager.disconnect(user_id, websocket)
