"""Telegram bot-backend validation. Never use client-decoded identity fields."""
import hashlib
import hmac
import json
import re
import time
from urllib.parse import parse_qsl, urlsplit

import httpx
from fastapi import HTTPException

_TELEGRAM_HOST = "api.telegram.org"
_UNCONFIRMED = "Telegram не подтвердил токен"


def validate_init_data(raw: str, bot_token: str | None, max_age: int, *, now: float | None = None) -> tuple[str, str, float]:
    if not bot_token:
        raise HTTPException(503, "Вход через Telegram пока не настроен")
    invalid = HTTPException(401, "Данные Telegram недействительны или устарели. Откройте Mini App заново")
    try:
        if not raw or len(raw) > 16384 or re.search(r"%(?![0-9a-fA-F]{2})", raw):
            raise ValueError()
        pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=True, encoding="utf-8", errors="strict", max_num_fields=32)
        fields = dict(pairs)
        if len(fields) != len(pairs) or any(not k or "\n" in k or "\r" in k for k in fields):
            raise ValueError()
        received = fields.pop("hash")
        if not re.fullmatch(r"[0-9a-fA-F]{64}", received):
            raise ValueError()
        # The bot-token HMAC includes signature when present. Only hash is excluded.
        check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
        secret = hmac.digest(b"WebAppData", bot_token.encode(), "sha256")
        if not hmac.compare_digest(hmac.digest(secret, check.encode(), "sha256"), bytes.fromhex(received)):
            raise ValueError()
        stamp = fields["auth_date"]
        if not re.fullmatch(r"[0-9]{1,12}", stamp):
            raise ValueError()
        issued = int(stamp)
        current = time.time() if now is None else now
        if issued > current + 30 or current - issued > max_age:
            raise ValueError()
        user = json.loads(fields["user"])
        identity = user["id"]
        if type(identity) is not int or not 0 < identity < 2**52 or user.get("is_bot", False):
            raise ValueError()
    except (ValueError, KeyError, TypeError, AttributeError, UnicodeError, RecursionError) as exc:
        raise invalid from exc
    # Canonical signed digest, independent of query ordering or percent encoding.
    return str(identity), received.lower(), issued + max_age


def validate_widget(data: dict, bot_token: str | None, max_age: int) -> tuple[str, str, float]:
    if not bot_token:
        raise HTTPException(503, "Вход через Telegram пока не настроен")
    fields = {k: str(v) for k, v in data.items() if v is not None and k != "hash"}
    check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    expected = hmac.new(hashlib.sha256(bot_token.encode()).digest(), check.encode(), hashlib.sha256).hexdigest()
    now = time.time()
    if not hmac.compare_digest(expected, data["hash"].lower()) or not now - max_age <= data["auth_date"] <= now + 30:
        raise HTTPException(401, "Данные Telegram недействительны или устарели. Повторите вход")
    # Keep Mini App and widget replay domains separate.
    digest = hashlib.sha256(("widget:" + expected).encode()).hexdigest()
    return str(data["id"]), digest, data["auth_date"] + max_age


def fetch_bot_identity(token: str) -> tuple[int, str] | str:
    """Call getMe. Return (bot id, username) or a description safe to show and store.

    The token stays in the request path. This function never logs that URL and
    refuses a token that would change the host or the method.
    """
    url = _get_me_url(token)
    if url is None:
        return _UNCONFIRMED
    try:
        response = httpx.get(url, timeout=10.0, follow_redirects=False)
        payload = response.json()
    except (httpx.HTTPError, ValueError):
        return _UNCONFIRMED
    identity = _accepted_bot(payload)
    return identity if identity is not None else _description(payload)


def _get_me_url(token: str) -> str | None:
    if not token or any(ord(char) < 32 or char in "/\\?#@ " for char in token):
        return None
    url = f"https://{_TELEGRAM_HOST}/bot{token}/getMe"
    parts = urlsplit(url)
    if (parts.scheme != "https" or parts.hostname != _TELEGRAM_HOST or parts.username
            or parts.password or parts.port is not None or parts.query or parts.fragment
            or parts.path != f"/bot{token}/getMe"):
        return None
    return url


def _accepted_bot(payload: object) -> tuple[int, str] | None:
    if not isinstance(payload, dict) or payload.get("ok") is not True:
        return None
    result = payload.get("result")
    if not isinstance(result, dict):
        return None
    bot_id = result.get("id")
    username = result.get("username")
    if type(bot_id) is not int or not 0 < bot_id < 2**63:
        return None
    if not isinstance(username, str) or not username or len(username) > 64:
        return None
    return bot_id, username


def _description(payload: object) -> str:
    if isinstance(payload, dict):
        description = payload.get("description")
        if isinstance(description, str) and description.strip():
            return description.strip()[:500]
    return _UNCONFIRMED
