from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from vetdietderm_api.encounter_templates.models import EncounterTemplate, utc_now
from vetdietderm_api.encounter_templates.schemas import EncounterTemplateUpdate, EncounterTemplateWrite


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден")


def _protected() -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Стандартный шаблон нельзя изменить")


def list_templates(session: Session, doctor_name: str | None) -> list[EncounterTemplate]:
    stmt = select(EncounterTemplate)
    if doctor_name:
        stmt = stmt.where(
            or_(
                EncounterTemplate.scope.in_(("standard", "clinic")),
                (EncounterTemplate.scope == "doctor") & (EncounterTemplate.doctor_name == doctor_name.strip()),
            )
        )
    else:
        stmt = stmt.where(EncounterTemplate.scope.in_(("standard", "clinic")))
    stmt = stmt.order_by(
        EncounterTemplate.section.asc(),
        EncounterTemplate.scope.asc(),
        EncounterTemplate.title.asc(),
    )
    return list(session.scalars(stmt).all())


def get_template(session: Session, template_uuid: UUID) -> EncounterTemplate:
    template = session.get(EncounterTemplate, template_uuid)
    if template is None:
        raise _not_found()
    return template


def create_template(session: Session, data: EncounterTemplateWrite) -> EncounterTemplate:
    template = EncounterTemplate(**data.model_dump(mode="json"))
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


def update_template(
    session: Session,
    template_uuid: UUID,
    data: EncounterTemplateUpdate,
) -> EncounterTemplate:
    template = get_template(session, template_uuid)
    if template.scope == "standard":
        raise _protected()
    payload = data.model_dump(exclude_unset=True, mode="json")
    next_scope = payload.get("scope", template.scope)
    next_doctor = payload.get("doctor_name", template.doctor_name)
    if next_scope == "standard":
        raise _protected()
    if next_scope == "doctor" and not next_doctor:
        raise HTTPException(status_code=422, detail="Для шаблона врача укажите имя врача")
    if next_scope == "clinic":
        payload["doctor_name"] = None
    for key, value in payload.items():
        setattr(template, key, value)
    template.updated_at = utc_now()
    session.commit()
    session.refresh(template)
    return template


def delete_template(session: Session, template_uuid: UUID) -> None:
    template = get_template(session, template_uuid)
    if template.scope == "standard":
        raise _protected()
    session.delete(template)
    session.commit()
