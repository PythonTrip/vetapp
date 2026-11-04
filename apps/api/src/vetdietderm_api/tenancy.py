"""Request-scoped ORM isolation, including identity lookups and eager/lazy loads."""
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import Uuid, delete, event, inspect, or_, select, text, update
from sqlalchemy.orm import Mapped, Session, aliased, mapped_column, with_loader_criteria


class TenantOwned:
    # Clinical rows belong to one clinic. NULL without an author stays unread except standard templates.
    tenant_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    created_by: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)


def rehome_personal_rows(session: Session, user_id, clinic_id, organization_name: str | None = None) -> None:
    """Move one doctor's null-tenant clinical rows and Telegram bindings into the clinic. A second call changes none of those rows."""
    from vetdietderm_api.appointments.models import Appointment
    from vetdietderm_api.assessments.models import DietPlan
    from vetdietderm_api.attachments.models import Attachment
    from vetdietderm_api.clinical_catalog.models import ClinicalCatalogItem
    from vetdietderm_api.communications.models import Communication
    from vetdietderm_api.encounter_templates.models import EncounterTemplate
    from vetdietderm_api.encounters.models import Encounter
    from vetdietderm_api.owners.models import ClinicLink, JoinCode, OwnerAccount, TelegramIdentity
    from vetdietderm_api.patients.models import Client, Patient

    doctor = UUID(str(user_id))
    clinic = UUID(str(clinic_id))
    clinical_rows = []
    for model in (
        Client, Patient, Encounter, EncounterTemplate, ClinicalCatalogItem,
        Appointment, Attachment, Communication, DietPlan,
    ):
        filters = [model.tenant_id.is_(None), model.created_by == doctor]
        if model.__tablename__ == "encounter_templates":
            filters.append(model.scope != "standard")
        clinical_rows.append((model, filters))

    personal_code = select(JoinCode).where(
        JoinCode.doctor_user_id == doctor, JoinCode.tenant_id.is_(None))
    existing_clinic_code = select(JoinCode).where(
        JoinCode.doctor_user_id == doctor, JoinCode.tenant_id == clinic)
    attached_to_doctor = (
        JoinCode.doctor_user_id == doctor,
        or_(JoinCode.tenant_id.is_(None), JoinCode.tenant_id == clinic),
    )
    stale_owners = (
        OwnerAccount.join_code_uuid.in_(select(JoinCode.uuid).where(*attached_to_doctor)),
        or_(OwnerAccount.tenant_id.is_(None), OwnerAccount.tenant_id != clinic),
    )
    claimed = aliased(TelegramIdentity)
    open_bindings = (
        TelegramIdentity.tenant_id.is_(None),
        TelegramIdentity.owner_account_uuid.in_(select(OwnerAccount.uuid).where(
            OwnerAccount.join_code_uuid.in_(select(JoinCode.uuid).where(*attached_to_doctor)),
        )),
        ~select(claimed.owner_account_uuid).where(
            claimed.tenant_id == clinic,
            claimed.telegram_user_id == TelegramIdentity.telegram_user_id,
        ).exists(),
    )
    pending = [select(model).where(*filters).exists() for model, filters in clinical_rows]
    pending.extend((
        personal_code.exists(),
        select(OwnerAccount).where(*stale_owners).exists(),
        select(TelegramIdentity).where(*open_bindings).exists(),
    ))
    if organization_name:
        pending.append(existing_clinic_code.where(
            or_(JoinCode.organization_name.is_(None), JoinCode.organization_name == "")
        ).exists())
    needs_rehome = select(or_(*pending))
    if not session.scalar(needs_rehome):
        return

    if session.get_bind().dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
                        {"key": f"vetapp:rehome:{doctor}"})
        session.execute(text("SELECT pg_advisory_xact_lock(:key)"),
                        {"key": int.from_bytes(clinic.bytes[:8], "big", signed=True)})
        if not session.scalar(needs_rehome):
            return

    for model, filters in clinical_rows:
        session.execute(update(model).where(*filters).values(tenant_id=clinic))

    personal = session.scalar(personal_code)
    link = session.get(ClinicLink, clinic)
    clinic_code = (session.scalar(select(JoinCode).where(JoinCode.code == link.code))
                   if link else session.scalar(existing_clinic_code))
    if personal is not None and clinic_code is not None:
        session.execute(update(OwnerAccount).where(OwnerAccount.join_code_uuid == personal.uuid).values(
            join_code_uuid=clinic_code.uuid, tenant_id=clinic, workspace="organization"))
        session.flush()
        session.delete(personal)
        session.flush()
    elif personal is not None:
        personal.tenant_id = clinic
        personal.workspace = "organization"
        if organization_name:
            personal.organization_name = organization_name
        session.execute(update(OwnerAccount).where(OwnerAccount.join_code_uuid == personal.uuid).values(
            tenant_id=clinic, workspace="organization"))
    if clinic_code is not None and organization_name and not clinic_code.organization_name:
        clinic_code.organization_name = organization_name
    session.execute(update(OwnerAccount).where(*stale_owners).values(
        tenant_id=clinic, workspace="organization"))
    session.execute(update(TelegramIdentity).where(*open_bindings).values(tenant_id=clinic))
    session.commit()


def move_empty_clinic(session: Session, invitee_id, source_id, destination_id) -> None:
    """Move one doctor's reusable rows into the inviting clinic and drop the source bot.

    Questionnaire rows still published on the closed clinic are removed for this doctor.
    The destination list stays, and that doctor can edit it. The public clinic link is
    removed so owner registration cannot resolve the closed clinic.
    """
    from vetdietderm_api.assessments.models import DietPlan
    from vetdietderm_api.clinical_catalog.models import ClinicalCatalogItem
    from vetdietderm_api.encounter_templates.models import EncounterTemplate
    from vetdietderm_api.owners.models import ClinicBot, ClinicLink
    from vetdietderm_api.questionnaires.models import VisitQuestion, VisitQuestionnaire

    invitee = UUID(str(invitee_id))
    source = UUID(str(source_id))
    destination = UUID(str(destination_id))
    for model in (EncounterTemplate, ClinicalCatalogItem):
        owned = (model.tenant_id == source, model.created_by == invitee, model.scope != "standard")
        session.execute(update(model).where(*owned, model.scope == "doctor").values(
            tenant_id=destination, scope="clinic"))
        session.execute(update(model).where(*owned, model.scope != "doctor").values(tenant_id=destination))
    session.execute(update(DietPlan).where(
        DietPlan.tenant_id == source,
        DietPlan.created_by == invitee,
        DietPlan.patient_uuid.is_(None),
    ).values(tenant_id=destination))
    closed_lists = select(VisitQuestionnaire.uuid).where(
        VisitQuestionnaire.doctor_user_id == invitee,
        VisitQuestionnaire.tenant_id == source,
    )
    session.execute(delete(VisitQuestion).where(VisitQuestion.questionnaire_uuid.in_(closed_lists)))
    session.execute(delete(VisitQuestionnaire).where(
        VisitQuestionnaire.doctor_user_id == invitee,
        VisitQuestionnaire.tenant_id == source,
    ))
    bot = session.get(ClinicBot, source)
    if bot is not None:
        session.delete(bot)
    link = session.get(ClinicLink, source)
    if link is not None:
        session.delete(link)
    session.commit()


class TenantSession(Session):
    pass


@event.listens_for(TenantSession, "do_orm_execute")
def scope_queries(state):
    from vetdietderm_api.db import Base

    tenant_value = state.session.info.get("tenant_id")
    if not tenant_value:
        raise HTTPException(403, "Клиника недоступна")
    tenant = UUID(str(tenant_value))
    user = UUID(str(state.session.info["user_id"]))
    if not state.is_select:
        # Bulk mutations bypass before_flush; do not allow them on tenant tables.
        if state.is_update or state.is_delete:
            table = state.statement.table
            if "tenant_id" in table.c:
                raise HTTPException(403, "Массовое изменение недоступно")
        return
    for mapper in Base.registry.mappers:
        cls = mapper.class_
        if not issubclass(cls, TenantOwned):
            continue
        condition = cls.tenant_id == tenant
        if cls.__tablename__ == "encounter_templates":
            condition = or_(condition, cls.tenant_id.is_(None) & cls.created_by.is_(None) & (cls.scope == "standard"))
        if cls.__tablename__ in {"encounter_templates", "clinical_catalog_items"}:
            condition = condition & or_(cls.scope != "doctor", cls.created_by == user)
        state.statement = state.statement.options(
            with_loader_criteria(cls, condition, include_aliases=True))


@event.listens_for(TenantSession, "before_flush")
def scope_writes(session, _context, _instances):
    tenant_value = session.info.get("tenant_id")
    if not tenant_value:
        raise HTTPException(403, "Клиника недоступна")
    tenant = UUID(str(tenant_value))
    user = UUID(str(session.info["user_id"]))
    for row in session.new | session.dirty | session.deleted:
        if not isinstance(row, TenantOwned):
            continue
        if row in session.new:
            row.tenant_id, row.created_by = tenant, user
        elif (row.tenant_id != tenant or inspect(row).attrs.tenant_id.history.has_changes()
              or inspect(row).attrs.created_by.history.has_changes()):
            raise HTTPException(404, "Запись не найдена")
        if getattr(row, "scope", None) == "doctor" and row.created_by != user:
            raise HTTPException(404, "Запись не найдена")
