from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..deps import get_current_user
from ..config import settings
from .. import notifications

router = APIRouter(prefix="/push", tags=["push"])


class Subscription(BaseModel):
    endpoint: str
    keys: dict


class Unsub(BaseModel):
    endpoint: str


@router.get("/key")
async def public_key():
    return {"key": settings.vapid_public_key}


@router.post("/subscribe")
async def subscribe(sub: Subscription, user=Depends(get_current_user)):
    await notifications.save_subscription(user["id"], sub.model_dump())
    return {"ok": True}


@router.post("/unsubscribe")
async def unsubscribe(body: Unsub, user=Depends(get_current_user)):
    await notifications.remove_subscription(user["id"], body.endpoint)
    return {"ok": True}
