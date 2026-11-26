"""Encryption and error sanitization for clinic bot credentials."""

from collections.abc import Iterable

from cryptography.fernet import Fernet, InvalidToken


def encrypt_secret(secret: str, key: str) -> str:
    return Fernet(key).encrypt(secret.encode("utf-8")).decode("ascii")


def decrypt_secret(ciphertext: str, key: str) -> str:
    return Fernet(key).decrypt(ciphertext).decode("utf-8")


def decrypt_credential(ciphertext: str | None, key: str) -> str | None:
    if not ciphertext or not key:
        return None
    try:
        return decrypt_secret(ciphertext, key)
    except (InvalidToken, UnicodeError):
        return None


def scrub_secrets(text: str, secrets: Iterable[str | None]) -> str:
    nonempty = sorted({secret for secret in secrets if secret}, key=len, reverse=True)
    while True:
        original = text
        for secret in nonempty:
            text = text.replace(secret, "")
        if text == original:
            return text.strip()[:500]
