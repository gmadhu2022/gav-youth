"""Thin async wrapper over Supabase's REST (PostgREST) and Auth endpoints.

The service-role key bypasses Row Level Security, so every function that acts
on behalf of a user must first confirm that user is allowed to — see
services.py, which checks participation before any read/write.
"""
import time
import httpx

from .config import settings

REST = f"{settings.supabase_url}/rest/v1"
AUTH = f"{settings.supabase_url}/auth/v1"

_SERVICE_HEADERS = {
    "apikey": settings.supabase_service_key,
    "Authorization": f"Bearer {settings.supabase_service_key}",
}

client = httpx.AsyncClient(timeout=15.0)

# ---- token -> user cache (avoids calling /auth/v1/user on every request) ----
_token_cache: dict[str, tuple[float, dict]] = {}
_TOKEN_TTL = 60.0


async def verify_token(token: str) -> dict | None:
    """Validate a Supabase access token and return the user, or None."""
    hit = _token_cache.get(token)
    if hit and hit[0] > time.time():
        return hit[1]
    r = await client.get(
        f"{AUTH}/user",
        headers={"apikey": settings.supabase_anon_key, "Authorization": f"Bearer {token}"},
    )
    if r.status_code != 200:
        return None
    user = r.json()
    _token_cache[token] = (time.time() + _TOKEN_TTL, user)
    return user


# ---------------- PostgREST helpers (service role) ----------------
async def rest_get(table: str, params: dict, count: bool = False):
    headers = dict(_SERVICE_HEADERS)
    if count:
        headers["Prefer"] = "count=exact"
    r = await client.get(f"{REST}/{table}", params=params, headers=headers)
    r.raise_for_status()
    total = None
    if count:
        cr = r.headers.get("content-range", "")
        if "/" in cr and cr.split("/")[-1].isdigit():
            total = int(cr.split("/")[-1])
    return r.json(), total


async def rest_insert(table: str, payload, prefer: str = "return=representation"):
    headers = {**_SERVICE_HEADERS, "Content-Type": "application/json", "Prefer": prefer}
    r = await client.post(f"{REST}/{table}", json=payload, headers=headers)
    r.raise_for_status()
    return r.json()


async def rest_patch(table: str, params: dict, payload: dict):
    headers = {**_SERVICE_HEADERS, "Content-Type": "application/json", "Prefer": "return=representation"}
    r = await client.patch(f"{REST}/{table}", params=params, json=payload, headers=headers)
    r.raise_for_status()
    return r.json()


async def aclose():
    await client.aclose()
