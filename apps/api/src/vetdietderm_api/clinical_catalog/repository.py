from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from vetdietderm_api.clinical_catalog.models import ClinicalCatalogItem, utc_now
from vetdietderm_api.clinical_catalog.schemas import ClinicalCatalogItemUpdate, ClinicalCatalogItemWrite


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Клинический элемент не найден")


def list_items(session: Session, doctor_name: str | None) -> list[ClinicalCatalogItem]:
    stmt = select(ClinicalCatalogItem)
    if doctor_name:
        stmt = stmt.where(
            or_(
                ClinicalCatalogItem.scope == "clinic",
                (ClinicalCatalogItem.scope == "doctor")
                & (ClinicalCatalogItem.doctor_name == doctor_name.strip()),
            )
        )
    else:
        stmt = stmt.where(ClinicalCatalogItem.scope == "clinic")
    stmt = stmt.order_by(ClinicalCatalogItem.kind.asc(), ClinicalCatalogItem.label.asc())
    return list(session.scalars(stmt).all())


def get_item(session: Session, item_uuid: UUID) -> ClinicalCatalogItem:
    item = session.get(ClinicalCatalogItem, item_uuid)
    if item is None:
        raise _not_found()
    return item


def create_item(session: Session, data: ClinicalCatalogItemWrite) -> ClinicalCatalogItem:
    item = ClinicalCatalogItem(**data.model_dump(mode="json"))
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def update_item(
    session: Session,
    item_uuid: UUID,
    data: ClinicalCatalogItemUpdate,
) -> ClinicalCatalogItem:
    item = get_item(session, item_uuid)
    payload = data.model_dump(exclude_unset=True, mode="json")
    next_scope = payload.get("scope", item.scope)
    next_doctor = payload.get("doctor_name", item.doctor_name)
    if next_scope == "doctor" and not next_doctor:
        raise HTTPException(status_code=422, detail="Для личного элемента укажите имя врача")
    if next_scope == "clinic":
        payload["doctor_name"] = None
    for key, value in payload.items():
        setattr(item, key, value)
    item.updated_at = utc_now()
    session.commit()
    session.refresh(item)
    return item


def delete_item(session: Session, item_uuid: UUID) -> None:
    item = get_item(session, item_uuid)
    session.delete(item)
    session.commit()
