"""Business logic for GAV YOUTH.

This is the "FastAPI logic" half of the hybrid: conversation creation, the
chat list with unread counts, sending, and read receipts all live here in
Python. Supabase still owns auth and realtime — a message inserted here lands
in the same table the frontend is subscribed to, so it streams live with no
extra work.
"""
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException

from .supabase_client import rest_get, rest_insert, rest_patch

MAX_MESSAGE_LEN = 4000
PROFILE_FIELDS = {"name", "username", "bio", "status_message", "avatar_url"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def is_participant(conversation_id: str, user_id: str) -> bool:
    rows, _ = await rest_get(
        "conversation_participants",
        {"conversation_id": f"eq.{conversation_id}", "user_id": f"eq.{user_id}", "select": "user_id"},
    )
    return len(rows) > 0


async def _require_participant(conversation_id: str, user_id: str):
    if not await is_participant(conversation_id, user_id):
        raise HTTPException(status_code=403, detail="You are not in this conversation")


# ---------------- people ----------------
async def list_people(user_id: str):
    rows, _ = await rest_get(
        "profiles",
        {"id": f"neq.{user_id}", "select": "id,name,username,avatar_url,status_message", "order": "name"},
    )
    return rows


# ---------------- conversations ----------------
async def get_or_create_direct(user_id: str, other_id: str) -> str:
    if other_id == user_id:
        raise HTTPException(status_code=400, detail="You cannot start a chat with yourself")

    mine, _ = await rest_get(
        "conversation_participants", {"user_id": f"eq.{user_id}", "select": "conversation_id"}
    )
    my_ids = {r["conversation_id"] for r in mine}
    if my_ids:
        theirs, _ = await rest_get(
            "conversation_participants", {"user_id": f"eq.{other_id}", "select": "conversation_id"}
        )
        for cid in my_ids & {r["conversation_id"] for r in theirs}:
            parts, _ = await rest_get(
                "conversation_participants", {"conversation_id": f"eq.{cid}", "select": "user_id"}
            )
            if len(parts) == 2:  # a genuine 1:1 conversation
                return cid

    conv = await rest_insert("conversations", {"created_by": user_id})
    cid = conv[0]["id"]
    await rest_insert(
        "conversation_participants",
        [{"conversation_id": cid, "user_id": user_id}, {"conversation_id": cid, "user_id": other_id}],
    )
    return cid


async def list_conversations(user_id: str):
    mine, _ = await rest_get(
        "conversation_participants",
        {"user_id": f"eq.{user_id}", "select": "conversation_id,last_read_at"},
    )
    out = []
    for row in mine:
        cid, last_read = row["conversation_id"], row["last_read_at"]

        others, _ = await rest_get(
            "conversation_participants",
            {"conversation_id": f"eq.{cid}", "user_id": f"neq.{user_id}",
             "select": "profiles(id,name,username,avatar_url)"},
        )
        if not others:
            continue
        op = others[0]["profiles"]

        msgs, _ = await rest_get(
            "messages",
            {"conversation_id": f"eq.{cid}", "order": "created_at.desc", "limit": "1",
             "select": "content,sender_id,created_at"},
        )
        last = msgs[0] if msgs else None

        _, unread = await rest_get(
            "messages",
            {"conversation_id": f"eq.{cid}", "sender_id": f"neq.{user_id}",
             "created_at": f"gt.{last_read}", "select": "id"},
            count=True,
        )

        out.append({
            "conversation_id": cid,
            "other_id": op["id"],
            "other_name": op["name"],
            "other_username": op["username"],
            "other_avatar": op["avatar_url"],
            "last_message": last["content"] if last else None,
            "last_sender_id": last["sender_id"] if last else None,
            "last_message_at": last["created_at"] if last else None,
            "unread_count": unread or 0,
        })

    out.sort(key=lambda r: r["last_message_at"] or "", reverse=True)
    return out


async def get_conversation(user_id: str, conversation_id: str):
    await _require_participant(conversation_id, user_id)
    others, _ = await rest_get(
        "conversation_participants",
        {"conversation_id": f"eq.{conversation_id}", "user_id": f"neq.{user_id}",
         "select": "profiles(id,name,username,avatar_url,last_seen)"},
    )
    other = others[0]["profiles"] if others else None
    messages, _ = await rest_get(
        "messages", {"conversation_id": f"eq.{conversation_id}", "order": "created_at.asc", "select": "*"}
    )
    return {"other": other, "messages": messages}


# ---------------- messages ----------------
async def send_message(user_id: str, conversation_id: str, content: str):
    content = (content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(content) > MAX_MESSAGE_LEN:
        raise HTTPException(status_code=400, detail="Message is too long")
    await _require_participant(conversation_id, user_id)
    # Hook point for moderation / notifications before the message lands.
    rows = await rest_insert(
        "messages", {"conversation_id": conversation_id, "sender_id": user_id, "content": content}
    )
    return rows[0]


async def mark_read(user_id: str, conversation_id: str):
    await _require_participant(conversation_id, user_id)
    ts = _now()
    await rest_patch(
        "conversation_participants",
        {"conversation_id": f"eq.{conversation_id}", "user_id": f"eq.{user_id}"},
        {"last_read_at": ts},
    )
    await rest_patch(
        "messages",
        {"conversation_id": f"eq.{conversation_id}", "sender_id": f"neq.{user_id}", "read_at": "is.null"},
        {"read_at": ts},
    )
    return {"ok": True}


# ---------------- profile ----------------
async def get_profile(user_id: str):
    rows, _ = await rest_get("profiles", {"id": f"eq.{user_id}", "select": "*"})
    if not rows:
        raise HTTPException(status_code=404, detail="Profile not found")
    return rows[0]


async def update_profile(user_id: str, data: dict):
    patch = {k: v for k, v in data.items() if k in PROFILE_FIELDS and v is not None}
    if not patch:
        return await get_profile(user_id)
    try:
        rows = await rest_patch("profiles", {"id": f"eq.{user_id}"}, patch)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 409:
            raise HTTPException(status_code=409, detail="That username is taken")
        raise HTTPException(status_code=400, detail="Could not update profile")
    return rows[0]
