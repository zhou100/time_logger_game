from fastapi import APIRouter
from . import auth, entries, me, ws

router = APIRouter(prefix="/v1")
router.include_router(auth.router)
router.include_router(entries.router)
router.include_router(me.router)
router.include_router(ws.router)
