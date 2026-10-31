"""Runtime configuration.

Settings are re-read from the environment / .env on every call, so adding a
GEMINI_API_KEY to backend/.env takes effect without restarting the server.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / ".env"


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str
    gemini_model: str
    database_url: str
    upload_dir: Path
    max_chars_per_doc: int
    cors_origins: list[str]


def get_settings() -> Settings:
    load_dotenv(ENV_FILE, override=True)
    upload_dir = Path(os.getenv("UPLOAD_DIR", BACKEND_DIR / "uploads"))
    upload_dir.mkdir(parents=True, exist_ok=True)
    return Settings(
        gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip(),
        database_url=os.getenv("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'nyaya.db'}"),
        upload_dir=upload_dir,
        max_chars_per_doc=int(os.getenv("MAX_CHARS_PER_DOC", "60000")),
        cors_origins=[
            o.strip()
            for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
            if o.strip()
        ],
    )
