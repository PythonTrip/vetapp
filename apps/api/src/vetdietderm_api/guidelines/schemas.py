from datetime import datetime
from uuid import UUID

from typing import Literal

from pydantic import BaseModel


class ActiveGuidelineRead(BaseModel):
    edition_uuid: UUID
    standard_code: str
    code: str
    import_version: int
    source_checksum: str
    source_title: str
    source_url: str
    publication_date: str | None
    language: str
    clinical_warning_ru: str
    published_at: datetime


class ContextOptionRead(BaseModel):
    code: str
    name_ru: str


class EnergyFormulaOptionRead(ContextOptionRead):
    required_animal_fields: list[str]
    result_kind: Literal["point", "range"]
    allowed_weight_bases: list[Literal["current", "target_override"]]


class SizeClassOptionRead(ContextOptionRead):
    min_adult_weight_kg: float | None
    max_adult_weight_kg: float | None


class GuidelineContextOptionsRead(BaseModel):
    edition_code: str
    profile_options: list[ContextOptionRead]
    energy_formula_options: list[EnergyFormulaOptionRead]
    size_class_options: list[SizeClassOptionRead]
