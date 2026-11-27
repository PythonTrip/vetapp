"""Consume stored private Telegram updates into clinic conversations."""

import asyncio
from datetime import UTC, datetime
from threading import Event
from uuid import UUID

from loguru import logger
from sqlalchemy import and_, or_, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from vetdietderm_api.attachments import storage
from vetdietderm_api.clock import utc_now
from vetdietderm_api.db import get_session_factory
from vetdietderm_api.messaging.content import has_telegram_file, load_telegram_file
from vetdietderm_api.messaging.models import (
    EXTERNAL_MESSAGE_IDENTITY,
    EXTERNAL_MESSAGE_PREDICATE,
    ConversationMessage,
)
from vetdietderm_api.messaging.repository import open_contact
from vetdietderm_api.telegram.models import TelegramUpdate
from vetdietderm_api.telegram.worker import pending_business_updates

type QueuePosition = tuple[datetime, UUID]


def _telegram_id(value: object) -> int | None:
    if type(value) is int and -(2**63) <= value < 2**63:
        return value
    return None


def _consume_update(session: Session, update: TelegramUpdate) -> None:
    message = update.payload.get(update.update_kind)
    if not isinstance(message, dict):
        logger.warning("Telegram business skipped update {}", update.uuid)
        return
    sender = message.get("from")
    chat = message.get("chat")
    user_id = _telegram_id(sender.get("id")) if isinstance(sender, dict) else None
    chat_id = _telegram_id(chat.get("id")) if isinstance(chat, dict) else None
    if user_id is None or chat_id is None or chat.get("type") != "private":
        logger.warning("Telegram business skipped update {}", update.uuid)
        return

    message_id = _telegram_id(message.get("message_id"))
    if message_id is None or type(message.get("date")) is not int:
        raise ValueError("Missing Telegram message identity or date")
    is_edit = update.update_kind == "edited_message"
    edit_date = message.get("edit_date") if is_edit else None
    if edit_date is not None and type(edit_date) is not int:
        raise ValueError("Invalid Telegram edit date")
    profile_name = " ".join(
        name.strip() for name in (sender.get("first_name"), sender.get("last_name"))
        if isinstance(name, str) and name.strip()
    )
    username = sender.get("username")
    _, conversation = open_contact(
        session, update.clinic_id, user_id, chat_id, profile_name or None,
        username if isinstance(username, str) else None,
    )
    body = message.get("text")
    table = ConversationMessage.__table__
    statement = insert(table).values(
        clinic_id=update.clinic_id,
        conversation_uuid=conversation.uuid,
        direction="inbound",
        channel="telegram",
        origin="telegram",
        occurred_at=datetime.fromtimestamp(message["date"], UTC),
        bot_id=update.bot_id,
        telegram_chat_id=chat_id,
        telegram_message_id=message_id,
        source_update_id=update.update_id,
        edited_at=datetime.fromtimestamp(edit_date, UTC) if edit_date is not None else None,
        body=body if isinstance(body, str) else None,
    )
    identity = {"index_elements": EXTERNAL_MESSAGE_IDENTITY, "index_where": EXTERNAL_MESSAGE_PREDICATE}
    if is_edit:
        incoming = statement.excluded
        stored = table.c
        newer_update = or_(stored.source_update_id.is_(None), incoming.source_update_id > stored.source_update_id)
        if edit_date is None:
            newer = newer_update
        else:
            newer = or_(
                incoming.edited_at > stored.edited_at,
                and_(or_(stored.edited_at.is_(None), incoming.edited_at == stored.edited_at), newer_update),
            )
        statement = statement.on_conflict_do_update(
            **identity,
            set_={
                "body": incoming.body,
                "edited_at": incoming.edited_at,
                "source_update_id": incoming.source_update_id,
            },
            where=and_(
                stored.clinic_id == incoming.clinic_id,
                stored.conversation_uuid == incoming.conversation_uuid,
                stored.direction == "inbound",
                newer,
            ),
        )
    else:
        statement = statement.on_conflict_do_nothing(**identity)
    accepted_id = session.scalar(statement.returning(table.c.uuid))
    if accepted_id is not None:
        _apply_attachment(session, update, session.get_one(ConversationMessage, accepted_id), message)
    update.business_consumed_at = utc_now()


def _apply_attachment(
    session: Session, update: TelegramUpdate, stored: ConversationMessage, message: dict,
) -> None:
    previous_key = stored.attachment_storage_key
    has_file = has_telegram_file(message)
    attachment = load_telegram_file(session, update, message) if has_file else None
    stored.attachment_storage_key = None
    stored.attachment_content_type = None
    stored.attachment_byte_size = None
    stored.unsupported_attachment = has_file and attachment is None
    if attachment is not None:
        content_type, payload = attachment
        stored.attachment_storage_key = storage.write_bytes(content_type, payload)
        stored.attachment_content_type = content_type
        stored.attachment_byte_size = len(payload)
        caption = message.get("caption")
        if isinstance(caption, str):
            stored.body = caption
    if previous_key != stored.attachment_storage_key:
        session.info["message_attachment_change"] = (previous_key, stored.attachment_storage_key)


def process_next_business_update(
    after: QueuePosition | None = None, *, stopping: Event | None = None,
) -> QueuePosition | None:
    position = None
    try:
        with get_session_factory()() as session:
            pending = pending_business_updates()
            if after is not None:
                pending = pending.where(tuple_(TelegramUpdate.created_at, TelegramUpdate.uuid) > after)
            update = session.scalar(pending.limit(1).with_for_update(skip_locked=True))
            if update is None:
                return None
            position = (update.created_at, update.uuid)
            commit_uncertain = committed = False
            try:
                _consume_update(session, update)
                if stopping is None or not stopping.is_set():
                    session.flush()
                    try:
                        session.commit()
                    except DBAPIError as exc:
                        # A lost commit response may mean the new file is already referenced.
                        commit_uncertain = exc.connection_invalidated
                        raise
                    committed = True
            finally:
                previous_key, new_key = session.info.pop("message_attachment_change", (None, None))
                obsolete_key = previous_key if committed else new_key
                if obsolete_key is not None and not commit_uncertain:
                    try:
                        storage.delete_file(obsolete_key)
                    except OSError as exc:
                        logger.warning("Telegram attachment cleanup failed for update {} ({})",
                                       update.uuid, type(exc).__name__)
    except Exception as exc:
        if position is None:
            logger.warning("Telegram business claim failed ({})", type(exc).__name__)
        else:
            logger.warning("Telegram business failed for update {} ({})", position[1], type(exc).__name__)
    return position


@logger.catch
async def run_business_worker() -> None:
    loop = asyncio.get_running_loop()
    stopping = Event()
    position = None
    while True:
        future = loop.run_in_executor(None, lambda: process_next_business_update(position, stopping=stopping))
        try:
            position = await asyncio.shield(future)
        except asyncio.CancelledError:
            stopping.set()
            await asyncio.gather(future, return_exceptions=True)
            raise
        if position is None:
            # A new pass retries rows skipped or rolled back in the previous pass.
            await asyncio.sleep(1)
