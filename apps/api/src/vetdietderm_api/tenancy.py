"""Request-scoped ORM isolation, including identity lookups and eager/lazy loads."""
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import Uuid, event, inspect, or_
from sqlalchemy.orm import Mapped, Session, mapped_column, with_loader_criteria


class TenantOwned:
    # NULL + created_by is personal; NULL + no owner is inaccessible legacy data.
    tenant_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    created_by: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)


class TenantSession(Session):
    pass


@event.listens_for(TenantSession, "do_orm_execute")
def scope_queries(state):
    from vetdietderm_api.db import Base

    tenant_value = state.session.info.get("tenant_id")
    tenant = UUID(str(tenant_value)) if tenant_value else None
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
        condition = cls.tenant_id == tenant if tenant else (cls.tenant_id.is_(None) & (cls.created_by == user))
        if cls.__tablename__ == "encounter_templates":
            condition = or_(condition, cls.tenant_id.is_(None) & cls.created_by.is_(None) & (cls.scope == "standard"))
        if cls.__tablename__ in {"encounter_templates", "clinical_catalog_items"}:
            condition = condition & or_(cls.scope != "doctor", cls.created_by == user)
        state.statement = state.statement.options(
            with_loader_criteria(cls, condition, include_aliases=True))


@event.listens_for(TenantSession, "before_flush")
def scope_writes(session, _context, _instances):
    tenant_value = session.info.get("tenant_id")
    tenant = UUID(str(tenant_value)) if tenant_value else None
    user = UUID(str(session.info["user_id"]))
    for row in session.new | session.dirty | session.deleted:
        if not isinstance(row, TenantOwned):
            continue
        if row in session.new:
            row.tenant_id, row.created_by = tenant, user
        elif (row.tenant_id != tenant or inspect(row).attrs.tenant_id.history.has_changes()
              or inspect(row).attrs.created_by.history.has_changes()
              or (tenant is None and row.created_by != user)):
            raise HTTPException(404, "Запись не найдена")
        if getattr(row, "scope", None) == "doctor" and row.created_by != user:
            raise HTTPException(404, "Запись не найдена")
