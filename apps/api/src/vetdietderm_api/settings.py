import re
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from pydantic import AnyHttpUrl, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

_API_ROOT = Path(__file__).resolve().parents[2]
_REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_API_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    DATABASE_URL: str = Field(default="", repr=False)
    DATABASE_ADDRESS: str | None = None
    DATABASE_PORT: int = Field(default=5432, ge=1, le=65535)
    DATABASE_NAME: str | None = None
    DATABASE_USER: str | None = None
    DATABASE_PASSWORD: str | None = Field(default=None, repr=False)
    DATABASE_SSLMODE: str = "prefer"
    MODULE_AUTH_URL: str = "http://127.0.0.1:8321"
    AUTH_COOKIE_SECURE: bool = False
    AUTH_COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    FRONTEND_URL: str = "http://127.0.0.1:3000"
    API_ALLOWED_ORIGINS: list[str] = Field(default_factory=list)
    ATTACHMENT_DIR: Path = _API_ROOT / "data" / "attachments"
    CLINIC_BOT_ENCRYPTION_KEY: str = Field(default="", repr=False)
    TELEGRAM_PUBLIC_BASE_URL: str = Field(default="", repr=False)

    @field_validator("CLINIC_BOT_ENCRYPTION_KEY")
    @classmethod
    def validate_clinic_bot_encryption_key(cls, value: str) -> str:
        if value:
            if re.fullmatch(r"[A-Za-z0-9_-]{43}=", value) is None:
                raise ValueError("CLINIC_BOT_ENCRYPTION_KEY must be a Fernet key")
            Fernet(value)
        return value

    @field_validator("TELEGRAM_PUBLIC_BASE_URL")
    @classmethod
    def validate_telegram_public_base_url(cls, value: str) -> str:
        if not value:
            return value
        message = "TELEGRAM_PUBLIC_BASE_URL must be an HTTPS origin"
        if any(char.isspace() or ord(char) < 32 or char in "\\?#%" for char in value):
            raise ValueError(message)
        try:
            AnyHttpUrl(value)
            parsed = urlsplit(value)
            port = parsed.port
        except ValueError:
            raise ValueError(message) from None
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username is not None
                or parsed.path not in {"", "/"} or parsed.netloc.endswith(":") or port == 0):
            raise ValueError(message)
        return value.removesuffix("/")

    @property
    def client_origins(self) -> list[str]:
        return sorted({origin.rstrip("/") for origin in (
            self.FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000",
            *self.API_ALLOWED_ORIGINS,
        )})

    @field_validator("API_ALLOWED_ORIGINS")
    @classmethod
    def validate_client_origins(cls, origins: list[str]) -> list[str]:
        for origin in origins:
            parsed = urlsplit(origin)
            if (parsed.scheme not in {"http", "https"} or not parsed.hostname
                    or "*" in origin or parsed.username or parsed.password
                    or parsed.path not in {"", "/"} or parsed.query or parsed.fragment):
                raise ValueError("API_ALLOWED_ORIGINS must contain exact HTTP(S) origins")
        return [origin.rstrip("/") for origin in origins]

    @model_validator(mode="after")
    def validate_cookie_settings(self) -> "Settings":
        if self.AUTH_COOKIE_SAMESITE == "none" and not self.AUTH_COOKIE_SECURE:
            raise ValueError("AUTH_COOKIE_SAMESITE=none requires AUTH_COOKIE_SECURE=true")
        return self

    @model_validator(mode="after")
    def build_database_url(self) -> "Settings":
        # Preserve existing deployments and integration-test URLs.
        if self.DATABASE_URL:
            return self
        required = ("DATABASE_ADDRESS", "DATABASE_NAME", "DATABASE_USER", "DATABASE_PASSWORD")
        missing = [name for name in required if not getattr(self, name)]
        if missing:
            raise ValueError(f"Missing database settings: {', '.join(missing)}")
        self.DATABASE_URL = URL.create(
            "postgresql+psycopg",
            username=self.DATABASE_USER,
            password=self.DATABASE_PASSWORD,
            host=self.DATABASE_ADDRESS,
            port=self.DATABASE_PORT,
            database=self.DATABASE_NAME,
            query={"sslmode": self.DATABASE_SSLMODE},
        ).render_as_string(hide_password=False)
        return self

    @field_validator("ATTACHMENT_DIR", mode="after")
    @classmethod
    def resolve_attachment_dir(cls, value: Path) -> Path:
        if value.is_absolute():
            return value
        return (_REPO_ROOT / value).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
