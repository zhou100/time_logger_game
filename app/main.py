from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .database import engine, Base
from .routers import auth, audio, chat, entries, categories, tasks, users
import logging

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown
    await engine.dispose()

app = FastAPI(lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(audio.router, prefix="/api/audio", tags=["audio"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(entries.router, prefix="/api/entries", tags=["entries"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(users.router, prefix="/api/users", tags=["users"])

# Debug: Print all registered routes
print("\nRegistered Routes:")
print("-" * 50)
for route in app.routes:
    print(f"Path: {route.path}")
    print(f"Name: {route.name}")
    print(f"Methods: {route.methods}")
    print(f"Endpoint: {route.endpoint}")
    print("-" * 50)

@app.get("/")
async def root():
    return {"message": "Welcome to the Time Logger Game API"}
