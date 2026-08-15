from pydantic import BaseModel


class StartConversation(BaseModel):
    other_user: str


class SendMessage(BaseModel):
    content: str


class ProfileUpdate(BaseModel):
    name: str | None = None
    username: str | None = None
    bio: str | None = None
    status_message: str | None = None
    avatar_url: str | None = None
