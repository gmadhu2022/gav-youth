from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .supabase_client import aclose
from .routers import conversations, people


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await aclose()


app = FastAPI(title="GAV YOUTH API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(conversations.router)
app.include_router(people.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
