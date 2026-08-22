"""AI features — reply suggestions and "Catch me up" summaries.

The differentiator WhatsApp can't match: its servers can't read messages, ours
can. Provider is auto-detected from whichever key is set (Groq or Anthropic).
A small in-memory rate limiter protects your free API quota.
"""
import json
import re
import time
from collections import defaultdict

from .config import settings
from .supabase_client import rest_get, client
from . import services

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

SYSTEM_SUGGEST = (
    "You suggest short, natural replies for a 1:1 chat. Given the recent "
    "conversation, propose exactly 3 brief replies the user (\"You\") might send "
    "next. Make them distinct — one agreeing, one asking a question, one casual. "
    "Each under 8 words. Match the conversation's language. "
    "Respond with ONLY a JSON array of 3 strings and nothing else."
)

SYSTEM_SUMMARY = (
    "You are catching someone up on a chat. Summarize the conversation below into "
    "2 to 4 short bullet points covering the key points, any questions aimed at "
    "the user, and any action items. Start each bullet with '- '. Be concise, "
    "match the conversation's language, and output only the bullets — no preamble."
)

# ---- rate limiting: N AI calls per user per rolling window ----
_calls = defaultdict(list)
RATE_MAX = 20
RATE_WINDOW = 60.0


def _rate_ok(user_id: str) -> bool:
    now = time.time()
    q = _calls[user_id]
    while q and q[0] < now - RATE_WINDOW:
        q.pop(0)
    if len(q) >= RATE_MAX:
        return False
    q.append(now)
    return True


def _has_key() -> bool:
    return bool(settings.groq_api_key or settings.anthropic_api_key)


def _parse(text: str) -> list[str]:
    text = (text or "").strip()
    m = re.search(r"\[.*\]", text, re.S)
    if m:
        try:
            arr = json.loads(m.group(0))
            out = [str(s).strip() for s in arr if str(s).strip()]
            if out:
                return out[:3]
        except Exception:
            pass
    lines = [re.sub(r'^[\-\d\.\)\s"]+', "", ln).strip().strip('"') for ln in text.splitlines()]
    return [ln for ln in lines if ln][:3]


async def _complete(system: str, user_content: str, max_tokens: int = 300) -> str:
    if settings.groq_api_key:
        resp = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}", "content-type": "application/json"},
            json={
                "model": settings.groq_model, "max_tokens": max_tokens, "temperature": 0.6,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_content}],
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    resp = await client.post(
        ANTHROPIC_URL,
        headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={
            "model": settings.anthropic_model, "max_tokens": max_tokens, "system": system,
            "messages": [{"role": "user", "content": user_content}],
        },
    )
    resp.raise_for_status()
    data = resp.json()
    return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")


async def _recent_transcript(user_id: str, conversation_id: str, limit: int) -> str | None:
    rows, _ = await rest_get(
        "messages",
        {"conversation_id": f"eq.{conversation_id}", "order": "created_at.desc",
         "limit": str(limit), "select": "sender_id,content,type"},
    )
    if not rows:
        return None
    rows = list(reversed(rows))
    return "\n".join(
        f"{'You' if r['sender_id'] == user_id else 'Them'}: {r.get('content') or '[media]'}"
        for r in rows
    )


async def reply_suggestions(user_id: str, conversation_id: str) -> list[str]:
    if not _has_key():
        return []
    if not await services.is_participant(conversation_id, user_id):
        return []
    if not _rate_ok(user_id):
        return []
    transcript = await _recent_transcript(user_id, conversation_id, 12)
    if not transcript:
        return []
    try:
        return _parse(await _complete(SYSTEM_SUGGEST, f"Conversation so far:\n{transcript}", 200))
    except Exception:
        return []


async def summarize(user_id: str, conversation_id: str) -> dict:
    if not _has_key():
        return {"summary": None, "error": "AI is not configured on the server."}
    if not await services.is_participant(conversation_id, user_id):
        return {"summary": None, "error": "Not allowed."}
    if not _rate_ok(user_id):
        return {"summary": None, "error": "Too many requests — wait a moment."}
    transcript = await _recent_transcript(user_id, conversation_id, 40)
    if not transcript:
        return {"summary": None, "error": "Nothing to summarize yet."}
    try:
        text = await _complete(SYSTEM_SUMMARY, transcript, 400)
        return {"summary": text.strip(), "error": None}
    except Exception:
        return {"summary": None, "error": "Could not summarize right now."}
