from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

_API_ROOT = Path(__file__).resolve().parents[2]
_REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / ".env", _API_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = Field(default="", repr=False)
    DATABASE_ADDRESS: str | None = None
    DATABASE_PORT: int = Field(default=5432, ge=1, le=65535)
    DATABASE_NAME: str | None = None
    DATABASE_USER: str | None = None
    DATABASE_PASSWORD: str | None = Field(default=None, repr=False)
    DATABASE_SSLMODE: str = "prefer"
    INSTANCE_PASSWORD: str = Field(min_length=1)
    FRONTEND_URL: str = "http://127.0.0.1:3000"
    ATTACHMENT_DIR: Path = _REPO_ROOT / "data" / "attachments"

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
