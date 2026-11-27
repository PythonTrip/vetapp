"""Deliver queued staff replies through the clinic's Telegram bot."""

import asyncio
from datetime import timedelta

from loguru import logger
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, sessionmaker

from vetdietderm_api.attachments.storage import resolve_file
from vetdietderm_api.clock import utc_now
from vetdietderm_api.db import get_session_factory
from vetdietderm_api.messaging.models import ConversationMessage
from vetdietderm_api.owners import telegram
from vetdietderm_api.owners.bot_crypto import decrypt_credential
from vetdietderm_api.owners.models import ClinicBot
from vetdietderm_api.owners.schemas import ClinicBotStatus
from vetdietderm_api.settings import get_settings

DELIVERY_ATTEMPT_LIMIT = 3
BOT_CHANGED = "Бот клиники изменился"


def _fail(message: ConversationMessage, error: str | None) -> None:
    message.delivery_status = "failed"
    message.next_attempt_at = None
    message.delivery_error = error


def _claim_next(db: Session) -> tuple[ConversationMessage, bool] | None:
    return db.execute(
        select(ConversationMessage, ClinicBot.clinic_id.is_not(None))
        .outerjoin(ClinicBot, ClinicBot.clinic_id == ConversationMessage.clinic_id)
        .where(
            ConversationMessage.delivery_status == "queued",
            or_(ConversationMessage.next_attempt_at.is_(None), ConversationMessage.next_attempt_at <= utc_now()),
            or_(
                ClinicBot.bot_id.is_(None),
                ClinicBot.bot_id.is_distinct_from(ConversationMessage.target_bot_id),
                ClinicBot.status == ClinicBotStatus.connected,
            ),
        )
        .order_by(ConversationMessage.created_at, ConversationMessage.uuid)
        .limit(1)
        .with_for_update(of=ConversationMessage, skip_locked=True)
    ).tuples().one_or_none()


def _finish_attempt(db: Session, message: ConversationMessage, result: telegram.BotSendResult) -> None:
    message.delivery_error = result.error
    if result.status == "sent":
        message.bot_id = message.target_bot_id
        message.telegram_message_id = result.message_id
        message.delivery_status = "sent"
    elif result.status == "failed":
        _fail(message, result.error)
    elif result.status == "retry":
        if message.delivery_attempt_count >= DELIVERY_ATTEMPT_LIMIT:
            _fail(message, result.error)
            return
        # Serialize the transition back to queued with bot replacement.
        bot = db.get(ClinicBot, message.clinic_id, with_for_update={"read": True}, populate_existing=True)
        if bot is None or bot.bot_id != message.target_bot_id:
            _fail(message, BOT_CHANGED)
            return
        try:
            message.next_attempt_at = utc_now() + timedelta(seconds=result.retry_after)
        except OverflowError:
            _fail(message, result.error)
            return
        message.delivery_status = "queued"


def process_next_delivery(factory: sessionmaker[Session]) -> bool:
    with factory() as db:
        claimed = _claim_next(db)
        if claimed is None:
            return False
        message, bot_exists = claimed
        try:
            # Bot replacement locks the bot first, then queued messages.
            # Skip its bot lock instead of waiting while holding the message lock.
            bot = db.get(ClinicBot, message.clinic_id, with_for_update={"read": True, "skip_locked": True})
            if bot is None and bot_exists:
                return False
            if bot is None or bot.bot_id is None or bot.bot_id != message.target_bot_id:
                _fail(message, BOT_CHANGED)
            elif bot.status != ClinicBotStatus.connected:
                return False
            else:
                _deliver(db, message, bot)
            db.commit()
        except Exception:
            db.rollback()
            logger.warning("Telegram delivery {} {}", message.uuid, message.delivery_status)
            return False
        logger.info("Telegram delivery {} {}", message.uuid, message.delivery_status)
        return True


def _deliver(db: Session, message: ConversationMessage, bot: ClinicBot) -> None:
    key = get_settings().CLINIC_BOT_ENCRYPTION_KEY
    token = decrypt_credential(bot.token, key)
    secret = decrypt_credential(bot.webhook_secret_ciphertext, key)
    chat_id = message.telegram_chat_id
    if token is None or chat_id is None:
        _fail(message, "Недоступны данные для отправки через Telegram")
        return
    attachment = None
    if message.attachment_storage_key and message.attachment_content_type:
        try:
            attachment = (message.attachment_content_type, resolve_file(message.attachment_storage_key).read_bytes())
        except OSError:
            _fail(message, "Файл сообщения недоступен")
            return

    message.delivery_status = "unconfirmed"
    message.delivery_attempt_count += 1
    message.next_attempt_at = None
    message.delivery_error = None
    db.commit()
    result = telegram.send_bot_message(token, secret, chat_id, message.body, attachment)
    _finish_attempt(db, message, result)


async def run_delivery_worker() -> None:
    while True:
        future = asyncio.get_running_loop().run_in_executor(None, lambda: process_next_delivery(get_session_factory()))
        try:
            processed = await asyncio.shield(future)
        except asyncio.CancelledError:
            await asyncio.gather(future, return_exceptions=True)
            raise
        except Exception:
            processed = False
        if not processed:
            await asyncio.sleep(1)
