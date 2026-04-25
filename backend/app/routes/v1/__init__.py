from fastapi import APIRouter
from . import auth, entries, captures, users, claim

router = APIRouter(prefix="/v1")
router.include_router(auth.router)
router.include_router(entries.router)
router.include_router(captures.router)
router.include_router(users.router)
router.include_router(claim.router)
