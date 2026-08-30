from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_API_ROOT = Path(__file__).resolve().parents[2]
_REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / ".env", _API_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str
    INSTANCE_PASSWORD: str = Field(min_length=1)
    ATTACHMENT_DIR: Path = _REPO_ROOT / "data" / "attachments"

    @field_validator("ATTACHMENT_DIR", mode="after")
    @classmethod
    def resolve_attachment_dir(cls, value: Path) -> Path:
        if value.is_absolute():
            return value
        return (_REPO_ROOT / value).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
