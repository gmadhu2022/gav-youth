from fastapi import APIRouter, Depends

from fastapi import APIRouter, Depends, Query

from ..deps import get_current_user
from ..schemas import StartConversation, SendMessage
from .. import services
from .. import ai

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("/{conversation_id}/suggestions")
async def suggestions(conversation_id: str, user=Depends(get_current_user)):
    return {"suggestions": await ai.reply_suggestions(user["id"], conversation_id)}


@router.get("/{conversation_id}/summary")
async def summary(conversation_id: str, user=Depends(get_current_user)):
    return await ai.summarize(user["id"], conversation_id)


@router.get("/{conversation_id}/messages")
async def older_messages(conversation_id: str, before: str = Query(...), user=Depends(get_current_user)):
    return await services.get_messages_before(user["id"], conversation_id, before)


@router.get("")
async def list_conversations(user=Depends(get_current_user)):
    return await services.list_conversations(user["id"])


@router.post("")
async def start_conversation(body: StartConversation, user=Depends(get_current_user)):
    cid = await services.get_or_create_direct(user["id"], body.other_user)
    return {"conversation_id": cid}


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, user=Depends(get_current_user)):
    return await services.get_conversation(user["id"], conversation_id)


@router.post("/{conversation_id}/messages")
async def send_message(conversation_id: str, body: SendMessage, user=Depends(get_current_user)):
    return await services.send_message(user["id"], conversation_id, body.model_dump())


@router.post("/{conversation_id}/read")
async def mark_read(conversation_id: str, user=Depends(get_current_user)):
    return await services.mark_read(user["id"], conversation_id)
