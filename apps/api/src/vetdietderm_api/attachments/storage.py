from pathlib import Path

from loguru import logger

from vetdietderm_api.ids import uuid6
from vetdietderm_api.settings import get_settings

MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
}


def matches_signature(content_type: str, payload: bytes) -> bool:
    match content_type:
        case "image/jpeg":
            return payload.startswith(b"\xff\xd8\xff")
        case "image/png":
            return payload.startswith(b"\x89PNG\r\n\x1a\n")
        case "image/gif":
            return payload.startswith((b"GIF87a", b"GIF89a"))
        case "image/webp":
            return payload.startswith(b"RIFF") and payload[8:12] == b"WEBP"
        case "application/pdf":
            return payload.startswith(b"%PDF-")
        case _:
            return False


def attachment_root() -> Path:
    root = get_settings().ATTACHMENT_DIR
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def extension_for(content_type: str) -> str:
    return ALLOWED_CONTENT_TYPES[content_type]


def write_bytes(content_type: str, payload: bytes) -> str:
    key = f"{uuid6()}{extension_for(content_type)}"
    path = attachment_root() / key
    # A failed write must not leave a partial file in the store.
    output = path.open("xb")
    try:
        with output:
            output.write(payload)
    except OSError:
        path.unlink(missing_ok=True)
        raise
    logger.info("Stored attachment {}", key)
    return key


def resolve_file(storage_key: str) -> Path:
    root = attachment_root()
    path = (root / Path(storage_key).name).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise FileNotFoundError(storage_key)
    return path


def delete_file(storage_key: str) -> None:
    try:
        resolve_file(storage_key).unlink()
    except FileNotFoundError:
        logger.warning("Attachment file already missing: {}", storage_key)
