"""Web Push notifications — deliver messages even when the tab is closed.

This is the biggest real gap versus WhatsApp for a web app. Push runs
best-effort: any failure is swallowed so it never blocks sending, and dead
subscriptions are pruned automatically.
"""
import asyncio
import json

from .config import settings
from .supabase_client import rest_get, rest_insert, rest_delete

try:
    from pywebpush import webpush, WebPushException
except Exception:  # library optional at import time
    webpush = None
    WebPushException = Exception


def enabled() -> bool:
    return bool(settings.vapid_private_key and settings.vapid_public_key and webpush)


async def save_subscription(user_id: str, sub: dict):
    endpoint = sub.get("endpoint")
    keys = sub.get("keys") or {}
    if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        return
    # upsert by endpoint: clear any existing row then insert fresh
    await rest_delete("push_subscriptions", {"endpoint": f"eq.{endpoint}"})
    await rest_insert("push_subscriptions", {
        "user_id": user_id, "endpoint": endpoint,
        "p256dh": keys["p256dh"], "auth": keys["auth"],
    })


async def remove_subscription(user_id: str, endpoint: str):
    if endpoint:
        await rest_delete("push_subscriptions", {"endpoint": f"eq.{endpoint}", "user_id": f"eq.{user_id}"})


def _send_one(sub_row: dict, payload: str):
    """Blocking web push call — run in a thread."""
    webpush(
        subscription_info={
            "endpoint": sub_row["endpoint"],
            "keys": {"p256dh": sub_row["p256dh"], "auth": sub_row["auth"]},
        },
        data=payload,
        vapid_private_key=settings.vapid_private_key,
        vapid_claims={"sub": settings.vapid_subject},
    )


async def notify_new_message(sender_id: str, conversation_id: str, body: str):
    if not enabled():
        return
    try:
        parts, _ = await rest_get(
            "conversation_participants",
            {"conversation_id": f"eq.{conversation_id}", "user_id": f"neq.{sender_id}", "select": "user_id"},
        )
        if not parts:
            return
        prof, _ = await rest_get("profiles", {"id": f"eq.{sender_id}", "select": "name,username"})
        title = (prof[0].get("name") or prof[0].get("username")) if prof else "New message"

        for p in parts:
            subs, _ = await rest_get("push_subscriptions", {"user_id": f"eq.{p['user_id']}", "select": "*"})
            for s in subs:
                payload = json.dumps({"title": title, "body": (body or "")[:120], "url": f"/chat/{conversation_id}"})
                try:
                    await asyncio.to_thread(_send_one, s, payload)
                except WebPushException as e:
                    status = getattr(getattr(e, "response", None), "status_code", None)
                    if status in (404, 410):  # subscription gone — prune it
                        await rest_delete("push_subscriptions", {"endpoint": f"eq.{s['endpoint']}"})
                except Exception:
                    pass
    except Exception:
        pass
