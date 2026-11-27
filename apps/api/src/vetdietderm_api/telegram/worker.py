"""Process the PostgreSQL transport queue for all clinic bots."""

import asyncio
from collections.abc import Callable
from uuid import UUID

from loguru import logger
from sqlalchemy import case, func, select, update
from sqlalchemy.orm import Session

from vetdietderm_api.db import get_session_factory
from vetdietderm_api.telegram.models import TelegramUpdate

RETRY_LIMIT = 3
updates = TelegramUpdate.__table__


def _retry_update():
    attempts = updates.c.attempt_count + 1
    return update(updates).values(
        attempt_count=attempts,
        transport_status=case((attempts >= RETRY_LIMIT, "error"), else_="queued"),
        claimed_at=None,
    )


def release_abandoned_claims(session: Session) -> None:
    session.execute(_retry_update().where(updates.c.transport_status == "claimed"))


def claim_next(session: Session) -> UUID | None:
    next_uuid = (
        select(updates.c.uuid)
        .where(updates.c.transport_status == "queued")
        .order_by(updates.c.created_at, updates.c.uuid)
        .limit(1)
        .with_for_update(skip_locked=True)
        .scalar_subquery()
    )
    return session.scalar(
        update(updates)
        .where(updates.c.uuid == next_uuid)
        .values(transport_status="claimed", claimed_at=func.now())
        .returning(updates.c.uuid)
    )


def mark_transport_complete(session: Session, uuid: UUID) -> None:
    session.execute(
        update(updates)
        .where(updates.c.uuid == uuid, updates.c.transport_status.in_(("queued", "claimed")))
        .values(transport_status="complete", transport_completed_at=func.now(), claimed_at=None)
    )


def record_transport_failure(session: Session, uuid: UUID) -> int | None:
    return session.scalar(
        _retry_update()
        .where(updates.c.uuid == uuid, updates.c.transport_status.in_(("queued", "claimed")))
        .returning(updates.c.attempt_count)
    )


def pending_business_updates():
    return (
        select(TelegramUpdate)
        .where(TelegramUpdate.transport_status == "complete", TelegramUpdate.business_consumed_at.is_(None))
        .order_by(TelegramUpdate.created_at, TelegramUpdate.uuid)
    )


def unconsumed_updates(session: Session) -> list[TelegramUpdate]:
    """Read transport-complete updates that are pending business processing."""
    return list(session.scalars(pending_business_updates()))


async def _transaction[T](operation: Callable[..., T], *args: UUID) -> T:
    def execute() -> T:
        with get_session_factory().begin() as session:
            return operation(session, *args)

    # Keep synchronous database I/O off the API loop and let shutdown drain
    # the current transaction before another lifespan can recover its claims.
    future = asyncio.get_running_loop().run_in_executor(None, execute)
    try:
        return await asyncio.shield(future)
    except asyncio.CancelledError:
        await asyncio.gather(future, return_exceptions=True)
        raise


@logger.catch
async def run_worker() -> None:
    await _transaction(release_abandoned_claims)
    while True:
        try:
            uuid = await _transaction(claim_next)
        except Exception as exc:
            logger.warning("Telegram queue claim failed ({}), retrying in 1 second", type(exc).__name__)
            await asyncio.sleep(1)
            continue
        if uuid is None:
            await asyncio.sleep(1)
            continue

        try:
            await _transaction(mark_transport_complete, uuid)
        except Exception:
            attempts = await _transaction(record_transport_failure, uuid)
            logger.warning("Telegram transport failed for update {} (attempt count {})", uuid, attempts)
