from fastapi import APIRouter, Depends

from ..deps import get_current_user
from ..schemas import ProfileUpdate
from .. import services

router = APIRouter(tags=["people"])


@router.get("/people")
async def list_people(user=Depends(get_current_user)):
    return await services.list_people(user["id"])


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return await services.get_profile(user["id"])


@router.put("/profile")
async def update_profile(body: ProfileUpdate, user=Depends(get_current_user)):
    return await services.update_profile(user["id"], body.model_dump())
