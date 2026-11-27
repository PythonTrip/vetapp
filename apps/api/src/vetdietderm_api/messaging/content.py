"""Validate staff compositions and load supported Telegram message files."""

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from vetdietderm_api.attachments import storage
from vetdietderm_api.owners.bot_crypto import decrypt_credential
from vetdietderm_api.owners.models import ClinicBot
from vetdietderm_api.owners.telegram import download_bot_file
from vetdietderm_api.settings import get_settings
from vetdietderm_api.telegram.models import TelegramUpdate

type MessageFile = tuple[str, bytes]

_PDF = "application/pdf"
_IMAGE_TYPES = tuple(content_type for content_type in storage.ALLOWED_CONTENT_TYPES if content_type.startswith("image/"))
_TELEGRAM_FILE_FIELDS = (
    "animation", "audio", "document", "live_photo", "paid_media", "photo",
    "sticker", "story", "video", "video_note", "voice",
)


def validate_staff_composition(text: str | None, file: UploadFile | None) -> tuple[str | None, MessageFile | None]:
    """Return the text and optional (content type, bytes) without writing or sending."""
    text = text if text and text.strip() else None
    if file is None:
        if text is None:
            raise HTTPException(422, "Добавьте текст или файл")
        return text, None

    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in storage.ALLOWED_CONTENT_TYPES:
        raise HTTPException(422, "Допустимы JPEG, PNG, WebP, GIF и PDF")
    payload = file.file.read(storage.MAX_ATTACHMENT_BYTES + 1)
    if len(payload) > storage.MAX_ATTACHMENT_BYTES:
        raise HTTPException(413, "Файл больше 8 МБ")
    if not storage.matches_signature(content_type, payload):
        raise HTTPException(422, "Содержимое файла не соответствует его формату")
    return text, (content_type, payload)


def has_telegram_file(message: dict) -> bool:
    return any(message.get(field) is not None for field in _TELEGRAM_FILE_FIELDS)


def load_telegram_file(session: Session, update: TelegramUpdate, message: dict) -> MessageFile | None:
    photo = message.get("photo")
    document = message.get("document")
    if isinstance(photo, list):
        allowed = _IMAGE_TYPES
        file = max(
            (size for size in photo if isinstance(size, dict)
             and type(size.get("file_size")) is int
             and 0 < size["file_size"] <= storage.MAX_ATTACHMENT_BYTES
             and isinstance(size.get("file_id"), str) and size["file_id"]),
            key=lambda size: size["file_size"], default={},
        )
    elif isinstance(document, dict) and document.get("mime_type") == _PDF:
        allowed = (_PDF,)
        file = document
        size = file.get("file_size")
        if type(size) is int and size > storage.MAX_ATTACHMENT_BYTES:
            return None
    else:
        return None

    file_id = file.get("file_id")
    if not isinstance(file_id, str) or not file_id:
        return None
    ciphertext = session.scalar(
        select(ClinicBot.token).where(ClinicBot.clinic_id == update.clinic_id, ClinicBot.bot_id == update.bot_id)
    )
    token = decrypt_credential(ciphertext, get_settings().CLINIC_BOT_ENCRYPTION_KEY)
    if token is None:
        return None
    payload = download_bot_file(token, file_id, storage.MAX_ATTACHMENT_BYTES)
    if payload is None:
        return None
    for content_type in allowed:
        if storage.matches_signature(content_type, payload):
            return content_type, payload
    return None
