"""Clinic bot credentials and Telegram webhook lifecycle."""

from secrets import token_urlsafe
from threading import Lock
from uuid import UUID
from weakref import WeakValueDictionary

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from vetdietderm_api.owners import telegram
from vetdietderm_api.owners.bot_crypto import decrypt_credential, encrypt_secret, scrub_secrets
from vetdietderm_api.owners.models import ClinicBot, JoinCode
from vetdietderm_api.owners.schemas import ClinicBotRead, ClinicBotStatus, ClinicBotWebhookStatus, ClinicBotWrite
from vetdietderm_api.settings import get_settings

DUPLICATE_BOT = "Этот бот уже подключён к другой клинике"
MISSING_BOT_SETTINGS = "Не задан ключ шифрования или публичный HTTPS-адрес."
BOT_NOT_CONNECTED = "Бот не подключён"
WEBHOOK_PATH = "/telegram/webhooks/"
WEBHOOK_REGISTRATION_ERROR = "Telegram не принял вебхук."
WEBHOOK_URL_ERROR = "Telegram не подтвердил вебхук этой установки."
PREVIOUS_WEBHOOK_ERROR = "Telegram не снял вебхук предыдущего бота."
DISCONNECT_WEBHOOK_ERROR = "Telegram не снял вебхук. Приём на этой стороне уже остановлен."

# The API runs in one process. Keep a clinic's mutation lock across disconnect's
# local commit and Telegram cleanup. PostgreSQL still reserves each bot ID.
_lifecycle_locks: WeakValueDictionary[UUID, Lock] = WeakValueDictionary()
_lifecycle_locks_guard = Lock()


def _lifecycle_lock(clinic: UUID) -> Lock:
    with _lifecycle_locks_guard:
        return _lifecycle_locks.setdefault(clinic, Lock())


def _token_error(detail: str, *credentials: str | None) -> str:
    return scrub_secrets(detail, credentials) or scrub_secrets("Telegram не подтвердил токен", credentials)


def require_bot_admin(user: dict) -> None:
    org = user.get("organization") or {}
    if org.get("org_role") not in {"owner", "admin"}:
        raise HTTPException(403, "Изменить бота могут владелец и администратор клиники")


def connected_bot(db: Session, code: JoinCode) -> ClinicBot | None:
    bot = db.get(ClinicBot, code.tenant_id)
    return bot if bot and bot.status == ClinicBotStatus.connected else None


def clinic_bot_read(row: ClinicBot | None) -> ClinicBotRead:
    if row is None:
        return ClinicBotRead()
    return ClinicBotRead(
        status=ClinicBotStatus(row.status),
        webhook_status=ClinicBotWebhookStatus(row.webhook_status),
        bot_id=row.bot_id,
        username=row.username,
        public_url=f"https://t.me/{row.username}" if row.username else None,
        last_error=row.last_error,
    )


def _register_webhook(row: ClinicBot, token: str, secret: str, url: str) -> bool:
    if not telegram.set_webhook(token, url, secret):
        row.webhook_status = ClinicBotWebhookStatus.error
        row.last_error = scrub_secrets(WEBHOOK_REGISTRATION_ERROR, (token, secret))
        return False
    confirmed = telegram.get_webhook_info(token) == url
    row.webhook_status = ClinicBotWebhookStatus.active if confirmed else ClinicBotWebhookStatus.error
    row.last_error = None if confirmed else scrub_secrets(WEBHOOK_URL_ERROR, (token, secret))
    return True


def save_clinic_bot(body: ClinicBotWrite, user: dict, tenant_id: str, db: Session) -> ClinicBotRead:
    require_bot_admin(user)
    clinic = UUID(str(tenant_id))
    with _lifecycle_lock(clinic):
        return _save_clinic_bot(body, clinic, db)


def _save_clinic_bot(body: ClinicBotWrite, clinic: UUID, db: Session) -> ClinicBotRead:
    settings = get_settings()
    key = settings.CLINIC_BOT_ENCRYPTION_KEY
    base_url = settings.TELEGRAM_PUBLIC_BASE_URL
    if not key or not base_url:
        raise HTTPException(422, f"{MISSING_BOT_SETTINGS} Токен не сохранён.")
    checked = telegram.fetch_bot_identity(body.token)
    row = db.get(ClinicBot, clinic, with_for_update=True)
    if isinstance(checked, str):
        stored_token = decrypt_credential(row.token, key) if row else None
        secret = decrypt_credential(row.webhook_secret_ciphertext, key) if row else None
        detail = _token_error(checked, body.token, stored_token, secret)
        if row is None:
            db.add(ClinicBot(clinic_id=clinic, status=ClinicBotStatus.error, last_error=detail))
            try:
                db.commit()
            except IntegrityError:
                # A concurrent connect may have created the clinic's row.
                db.rollback()
        elif row.status == ClinicBotStatus.error:
            row.last_error = detail
            db.commit()
        raise HTTPException(422, detail)
    bot_id, username = checked
    taken = db.scalar(select(ClinicBot.clinic_id).where(
        ClinicBot.bot_id == bot_id, ClinicBot.clinic_id != clinic))
    if taken is not None:
        raise HTTPException(409, DUPLICATE_BOT)
    previous_token = None
    previous_secret = None
    if row is None:
        row = ClinicBot(clinic_id=clinic, status=ClinicBotStatus.connected)
        db.add(row)
    elif row.bot_id != bot_id:
        previous_token = decrypt_credential(row.token, key)
        previous_secret = decrypt_credential(row.webhook_secret_ciphertext, key)

    # Claim the bot ID before making Telegram-side changes. The flush also gives
    # a new row its integration ID while keeping it invisible until commit.
    row.bot_id = bot_id
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, DUPLICATE_BOT) from None

    previous_cleanup_failed = False
    if previous_token and not isinstance(telegram.fetch_bot_identity(previous_token), str):
        previous_cleanup_failed = not telegram.delete_webhook(previous_token)
    secret = token_urlsafe(32)
    row.token = encrypt_secret(body.token, key)
    row.webhook_secret_ciphertext = encrypt_secret(secret, key)
    row.username = username
    row.status = ClinicBotStatus.connected
    expected_url = f"{base_url}{WEBHOOK_PATH}{row.integration_id}"
    registered = _register_webhook(row, body.token, secret, expected_url)
    if registered and previous_cleanup_failed:
        row.last_error = scrub_secrets(PREVIOUS_WEBHOOK_ERROR, (body.token, secret, previous_token, previous_secret))
    db.commit()
    return clinic_bot_read(row)


def verify_clinic_bot(user: dict, tenant_id: str, db: Session) -> ClinicBotRead:
    require_bot_admin(user)
    row = db.get(ClinicBot, UUID(str(tenant_id)), with_for_update=True)
    if row is None or not row.token:
        raise HTTPException(422, BOT_NOT_CONNECTED)
    settings = get_settings()
    key = settings.CLINIC_BOT_ENCRYPTION_KEY
    base_url = settings.TELEGRAM_PUBLIC_BASE_URL
    secret = decrypt_credential(row.webhook_secret_ciphertext, key)
    token = decrypt_credential(row.token, key)
    if not key or not base_url:
        row.last_error = scrub_secrets(MISSING_BOT_SETTINGS, (token, secret))
        row.webhook_status = ClinicBotWebhookStatus.error
    elif token is None:
        row.status = ClinicBotStatus.error
        row.webhook_status = ClinicBotWebhookStatus.error
        row.last_error = scrub_secrets("Не удалось прочитать токен бота.", (secret,))
    else:
        checked = telegram.fetch_bot_identity(token)
        if isinstance(checked, str):
            row.status = ClinicBotStatus.error
            row.webhook_status = ClinicBotWebhookStatus.error
            row.last_error = _token_error(checked, token, secret)
        else:
            row.status = ClinicBotStatus.connected
            expected_url = f"{base_url}{WEBHOOK_PATH}{row.integration_id}"
            reported_url = telegram.get_webhook_info(token)
            if row.webhook_secret_ciphertext is None:
                secret = token_urlsafe(32)
                row.webhook_secret_ciphertext = encrypt_secret(secret, key)
                _register_webhook(row, token, secret, expected_url)
            elif secret is None:
                row.webhook_status = ClinicBotWebhookStatus.error
                row.last_error = scrub_secrets("Не удалось прочитать секрет вебхука.", (token,))
            elif reported_url == expected_url and row.webhook_status == ClinicBotWebhookStatus.active:
                row.last_error = None
            else:
                _register_webhook(row, token, secret, expected_url)
    db.commit()
    return clinic_bot_read(row)


def disconnect_clinic_bot(user: dict, tenant_id: str, db: Session) -> ClinicBotRead:
    require_bot_admin(user)
    clinic = UUID(str(tenant_id))
    with _lifecycle_lock(clinic):
        return _disconnect_clinic_bot(clinic, db)


def _disconnect_clinic_bot(clinic: UUID, db: Session) -> ClinicBotRead:
    row = db.get(ClinicBot, clinic, with_for_update=True)
    if row is None:
        raise HTTPException(422, BOT_NOT_CONNECTED)
    if row.status == ClinicBotStatus.disconnected and row.token is None and row.webhook_secret_ciphertext is None:
        result = clinic_bot_read(row)
        db.commit()
        return result
    bot_id = row.bot_id
    ciphertext = row.token
    key = get_settings().CLINIC_BOT_ENCRYPTION_KEY
    token = decrypt_credential(ciphertext, key)
    secret = decrypt_credential(row.webhook_secret_ciphertext, key)
    row.token = None
    row.webhook_secret_ciphertext = None
    row.status = ClinicBotStatus.disconnected
    row.webhook_status = ClinicBotWebhookStatus.not_configured
    row.last_error = None
    disconnected = clinic_bot_read(row)
    db.commit()
    if ciphertext is None:
        return disconnected

    # Keep the old bot ID reserved while calling Telegram. A clinic transfer
    # can remove the row, in which case another clinic may already own the bot.
    current = db.get(ClinicBot, clinic, with_for_update=True, populate_existing=True)
    if current is None:
        return disconnected
    if current.bot_id == bot_id and current.status == ClinicBotStatus.disconnected:
        if not token or not telegram.delete_webhook(token):
            current.last_error = scrub_secrets(DISCONNECT_WEBHOOK_ERROR, (token, secret))
    result = clinic_bot_read(current)
    db.commit()
    return result


def read_clinic_bot(db: Session, clinic_id: UUID) -> ClinicBotRead:
    return clinic_bot_read(db.get(ClinicBot, clinic_id))
