from __future__ import annotations

from typing import Any
from uuid import UUID, uuid5

from vetdietderm_api.standards.fediaf.v2025.models import SourceReference

FEDIAF_NAMESPACE = UUID("61614324-271f-52e4-9ef8-d49753e69dd0")


def stable_uuid(kind: str, identity: str) -> UUID:
    return uuid5(FEDIAF_NAMESPACE, f"{kind}:{identity}")


def source_reference(
    identity: str,
    source_url: str,
    *,
    page: int | None = None,
    table_code: str | None = None,
    section_code: str | None = None,
    row_code: str | None = None,
    footnote: str | None = None,
    source_value_text: str | None = None,
    note_ru: str | None = None,
    source_language: str = "en",
) -> SourceReference:
    return SourceReference(
        uuid=stable_uuid("source", identity),
        source_url=source_url,
        source_language=source_language,
        page=page,
        table_code=table_code,
        section_code=section_code,
        row_code=row_code,
        footnote=footnote,
        source_value_text=source_value_text,
        note_ru=note_ru,
    )


def profile_target_source(
    species: str,
    profile_code: str,
    sort_order: int,
    target: dict[str, Any],
    profile_source: dict[str, Any],
    default_url: str,
    *,
    identity_suffix: str = "",
    note_ru: str | None = None,
) -> SourceReference:
    code = target["code"]
    identity = f"target:{species}:{profile_code}:{sort_order}:{code}:{identity_suffix}"
    return source_reference(
        identity,
        profile_source.get("url", default_url),
        page=profile_source.get("page"),
        table_code=profile_source.get("table"),
        row_code=code if not identity_suffix else f"{code}:{identity_suffix}",
        footnote=target.get("footnote"),
        source_value_text=target.get("source_value_text"),
        note_ru=note_ru if note_ru is not None else target.get("note_ru"),
        source_language=profile_source.get("language", "en"),
    )
