from collections.abc import Iterator
from functools import lru_cache

from fastapi import HTTPException
from loguru import logger
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from vetdietderm_api.settings import get_settings


class Base(DeclarativeBase):
    pass


def sqlalchemy_url(database_url: str) -> str:
    if database_url.startswith("postgresql+"):
        return database_url
    if database_url.startswith("postgres://"):
        return f"postgresql+psycopg://{database_url.removeprefix('postgres://')}"
    if database_url.startswith("postgresql://"):
        return f"postgresql+psycopg://{database_url.removeprefix('postgresql://')}"
    return database_url


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    return create_engine(
        sqlalchemy_url(settings.DATABASE_URL),
        pool_pre_ping=True,
        pool_recycle=60,
    )


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False, autoflush=False)


def get_session() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def ping_database() -> None:
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        logger.exception("PostgreSQL ping failed")
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
