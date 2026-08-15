from fastapi import Header, HTTPException

from .supabase_client import verify_token


async def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]
    user = await verify_token(token)
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user
