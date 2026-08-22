from pydantic import BaseModel


class StartConversation(BaseModel):
    other_user: str


class SendMessage(BaseModel):
    content: str | None = None
    type: str = "text"                      # text | image | file | audio
    attachment_path: str | None = None
    attachment_name: str | None = None
    attachment_size: int | None = None
    attachment_mime: str | None = None
    duration_ms: int | None = None


class ProfileUpdate(BaseModel):
    name: str | None = None
    username: str | None = None
    bio: str | None = None
    status_message: str | None = None
    avatar_url: str | None = None
