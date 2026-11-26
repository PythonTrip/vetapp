"""Telegram Bot API helpers for clinic bot token verification."""
from urllib.parse import urlsplit

import httpx

_TELEGRAM_HOST = "api.telegram.org"
_UNCONFIRMED = "Telegram не подтвердил токен"


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
