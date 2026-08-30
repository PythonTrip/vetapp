from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class GuidelineStandard(Base):
    __tablename__ = "guideline_standards"

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    publisher: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class GuidelineEdition(Base):
    __tablename__ = "guideline_editions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'validated', 'published', 'retired')",
            name="ck_guideline_editions_status",
        ),
        UniqueConstraint(
            "standard_uuid",
            "code",
            "import_version",
            name="uq_guideline_editions_identity",
        ),
        Index(
            "uq_guideline_editions_one_published",
            "standard_uuid",
            unique=True,
            postgresql_where=text("status = 'published'"),
        ),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    standard_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("guideline_standards.uuid", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    import_version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    source_checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    source_title: Mapped[str] = mapped_column(String(500), nullable=False)
    source_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    publication_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    language: Mapped[str] = mapped_column(String(16), nullable=False)
    clinical_warning_ru: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class GuidelineProfile(Base):
    __tablename__ = "guideline_profiles"
    __table_args__ = (
        CheckConstraint("species_code IN ('dog', 'cat')", name="ck_guideline_profiles_species"),
        CheckConstraint(
            "calculation_basis IN ('published_per_1000_kcal', 'daily_per_metabolic_bw')",
            name="ck_guideline_profiles_calculation_basis",
        ),
        UniqueConstraint("edition_uuid", "code", name="uq_guideline_profiles_edition_code"),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    edition_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("guideline_editions.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    species_code: Mapped[str] = mapped_column(String(16), nullable=False)
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    name_ru: Mapped[str] = mapped_column(String(500), nullable=False)
    physiological_state: Mapped[str | None] = mapped_column(String(64), nullable=True)
    energy_basis_value: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    energy_basis_unit: Mapped[str] = mapped_column(String(32), nullable=False)
    energy_basis_type: Mapped[str] = mapped_column(String(64), nullable=False)
    calculation_basis: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="published_per_1000_kcal",
    )
    clinician_selectable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class SourceReference(Base):
    __tablename__ = "source_references"

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    edition_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("guideline_editions.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    source_language: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    table_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    section_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    row_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    footnote: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_value_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    note_ru: Mapped[str | None] = mapped_column(Text, nullable=True)


class ApplicabilityRule(Base):
    __tablename__ = "applicability_rules"
    __table_args__ = (
        UniqueConstraint("edition_uuid", "code", name="uq_applicability_rules_edition_code"),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    edition_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("guideline_editions.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    name_ru: Mapped[str] = mapped_column(String(500), nullable=False)
    predicate_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    note_ru: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_reference_uuid: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("source_references.uuid", ondelete="SET NULL"),
        nullable=True,
    )


class DerivedExpression(Base):
    __tablename__ = "derived_expressions"
    __table_args__ = (
        CheckConstraint(
            "expression_type IN ('sum', 'ratio', 'formula')",
            name="ck_derived_expressions_type",
        ),
        UniqueConstraint("edition_uuid", "code", name="uq_derived_expressions_edition_code"),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    edition_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("guideline_editions.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    name_ru: Mapped[str] = mapped_column(String(500), nullable=False)
    result_unit: Mapped[str] = mapped_column(String(32), nullable=False)
    expression_type: Mapped[str] = mapped_column(String(16), nullable=False)
    ast_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class EnergyFormula(Base):
    __tablename__ = "energy_formulas"
    __table_args__ = (
        CheckConstraint("species_code IN ('dog', 'cat')", name="ck_energy_formulas_species"),
        CheckConstraint(
            "result_kind IN ('point', 'range')",
            name="ck_energy_formulas_result_kind",
        ),
        CheckConstraint(
            "(result_kind = 'point' AND formula_ast IS NOT NULL "
            "AND formula_ast <> 'null'::jsonb) OR "
            "(result_kind = 'range' AND range_ast IS NOT NULL "
            "AND range_ast <> 'null'::jsonb)",
            name="ck_energy_formulas_executable_result",
        ),
        UniqueConstraint(
            "edition_uuid",
            "species_code",
            "code",
            name="uq_energy_formulas_edition_species_code",
        ),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    edition_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("guideline_editions.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    profile_uuid: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("guideline_profiles.uuid", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    species_code: Mapped[str] = mapped_column(String(16), nullable=False)
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    name_ru: Mapped[str] = mapped_column(String(500), nullable=False)
    formula_ast: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB(none_as_null=True),
        nullable=True,
    )
    range_ast: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    required_animal_fields: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    result_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="point")
    allowed_weight_bases: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: ["current"],
    )
    result_unit: Mapped[str] = mapped_column(String(64), nullable=False)
    applicability_rule_uuid: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("applicability_rules.uuid", ondelete="SET NULL"),
        nullable=True,
    )
    source_reference_uuid: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("source_references.uuid", ondelete="SET NULL"),
        nullable=True,
    )
    note_ru: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class GuidelineTarget(Base):
    __tablename__ = "guideline_targets"
    __table_args__ = (
        CheckConstraint(
            "(nutrient_uuid IS NOT NULL AND derived_expression_uuid IS NULL) OR "
            "(nutrient_uuid IS NULL AND derived_expression_uuid IS NOT NULL)",
            name="ck_guideline_targets_subject_xor",
        ),
        CheckConstraint(
            "target_status IN ('established', 'not_established')",
            name="ck_guideline_targets_status",
        ),
        CheckConstraint(
            "basis IN ('per_1000_kcal_me', 'daily_per_metabolic_bw')",
            name="ck_guideline_targets_basis",
        ),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    edition_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("guideline_editions.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    profile_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("guideline_profiles.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nutrient_uuid: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("nutrients.uuid", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    derived_expression_uuid: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("derived_expressions.uuid", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    source_code: Mapped[str] = mapped_column(String(128), nullable=False)
    target_status: Mapped[str] = mapped_column(String(32), nullable=False)
    minimum_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    maximum_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    basis: Mapped[str] = mapped_column(String(32), nullable=False)
    applicability_rule_uuid: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("applicability_rules.uuid", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_reference_uuid: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("source_references.uuid", ondelete="SET NULL"),
        nullable=True,
    )
    source_value_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    footnote: Mapped[str | None] = mapped_column(Text, nullable=True)
    note_ru: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class GrowthSizeClass(Base):
    __tablename__ = "growth_size_classes"
    __table_args__ = (
        CheckConstraint("species_code IN ('dog', 'cat')", name="ck_growth_size_classes_species"),
        UniqueConstraint("edition_uuid", "code", name="uq_growth_size_classes_edition_code"),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    edition_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("guideline_editions.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    species_code: Mapped[str] = mapped_column(String(16), nullable=False)
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    name_ru: Mapped[str] = mapped_column(String(500), nullable=False)
    min_adult_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    max_adult_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    min_exclusive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_inclusive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    growth_curve_ast: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    min_age_weeks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_age_weeks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_reference_uuid: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("source_references.uuid", ondelete="SET NULL"),
        nullable=True,
    )


class LactationFactor(Base):
    __tablename__ = "lactation_factors"
    __table_args__ = (
        CheckConstraint("species_code IN ('dog', 'cat')", name="ck_lactation_factors_species"),
        UniqueConstraint(
            "edition_uuid",
            "species_code",
            "week",
            name="uq_lactation_factors_edition_species_week",
        ),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    edition_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("guideline_editions.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    species_code: Mapped[str] = mapped_column(String(16), nullable=False)
    week: Mapped[int] = mapped_column(Integer, nullable=False)
    factor: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    source_reference_uuid: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("source_references.uuid", ondelete="SET NULL"),
        nullable=True,
    )
