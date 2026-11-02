"""Private owner media; files are never published as unauthenticated URLs."""
from pathlib import PurePosixPath

from fastapi import HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select

from vetdietderm_api.attachments import storage
from vetdietderm_api.owners import repository as owners
from vetdietderm_api.owners.models import OwnerAnimal, OwnerUpload
from vetdietderm_api.owners.schemas import AnimalRead


def animal_ids(db, owner, animal_id):
    # Serialize with registration acceptance, including uploads made before acceptance.
    registration = owners.registration_for_owner(db, owner, lock=True)
    if not any(animal.uuid == animal_id for animal in owners.list_animals(db, owner)):
        raise HTTPException(404, "Животное не найдено")
    previous = db.scalars(select(OwnerAnimal.uuid).where(
        OwnerAnimal.registration_uuid == registration.uuid, OwnerAnimal.patient_uuid == animal_id))
    return [animal_id, *previous]


def photo_read(db, owner, animal):
    ids = [animal.uuid, *db.scalars(select(OwnerAnimal.uuid).where(OwnerAnimal.patient_uuid == animal.uuid))]
    photo = db.scalar(select(OwnerUpload).where(OwnerUpload.owner_account_uuid == owner.uuid,
        OwnerUpload.animal_uuid.in_(ids), OwnerUpload.kind == "photo").order_by(OwnerUpload.created_at.desc(), OwnerUpload.uuid.desc()))
    result = AnimalRead.model_validate(animal)
    if photo:
        result.photo_url = f"/api/owner/uploads/{photo.uuid}"
    return result


def list_files(db, owner, animal_id):
    ids = animal_ids(db, owner, animal_id)
    return list(db.scalars(select(OwnerUpload).where(OwnerUpload.owner_account_uuid == owner.uuid,
        OwnerUpload.animal_uuid.in_(ids), OwnerUpload.kind == "document").order_by(OwnerUpload.created_at.desc(), OwnerUpload.uuid.desc())))


def upload(db, owner, animal_id, file, kind):
    animal_ids(db, owner, animal_id)
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in storage.ALLOWED_CONTENT_TYPES or (kind == "photo" and not content_type.startswith("image/")):
        raise HTTPException(400, "Допустимы JPEG, PNG, WebP, GIF и PDF; для фото — только изображения")
    body = file.file.read(storage.MAX_ATTACHMENT_BYTES + 1)
    if not body:
        raise HTTPException(400, "Файл пустой")
    if len(body) > storage.MAX_ATTACHMENT_BYTES:
        raise HTTPException(413, "Файл больше 8 МБ")
    signatures = {"image/jpeg": body.startswith(b"\xff\xd8\xff"), "image/png": body.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/gif": body.startswith((b"GIF87a", b"GIF89a")), "image/webp": body.startswith(b"RIFF") and body[8:12] == b"WEBP",
        "application/pdf": body.startswith(b"%PDF-")}
    if not signatures[content_type]:
        raise HTTPException(400, "Содержимое файла не соответствует его формату")
    key = storage.write_bytes(content_type, body)
    filename = PurePosixPath((file.filename or "Файл").replace("\\", "/")).name
    filename = "".join(c for c in filename if c.isprintable())[:255] or "Файл"
    row = OwnerUpload(owner_account_uuid=owner.uuid, animal_uuid=animal_id, kind=kind,
        filename=filename, content_type=content_type, byte_size=len(body), storage_key=key)
    try:
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        storage.delete_file(key)
        raise
    return row


def download(row, *, inline=False):
    if row is None:
        raise HTTPException(404, "Файл не найден")
    try:
        path = storage.resolve_file(row.storage_key)
    except FileNotFoundError:
        raise HTTPException(404, "Файл не найден") from None
    return FileResponse(path, media_type=row.content_type, filename=row.filename,
        content_disposition_type="inline" if inline and row.content_type.startswith("image/") else "attachment",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
