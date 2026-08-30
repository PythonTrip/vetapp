"""Create versioned FEDIAF guideline tables.

Revision ID: 0004_fediaf_guidelines
Revises: 0003_food_catalog
Create Date: 2026-08-28
"""

from datetime import datetime, timezone
from typing import Sequence, Union
from uuid import UUID, uuid1

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_fediaf_guidelines"
down_revision: Union[str, Sequence[str], None] = "0003_food_catalog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _uuid6() -> UUID:
    value = uuid1()
    timestamp = value.time
    time_high = (timestamp >> 28) & 0xFFFFFFFF
    time_mid = (timestamp >> 12) & 0xFFFF
    time_low = timestamp & 0x0FFF
    clock_seq = value.clock_seq & 0x3FFF
    node = value.node & 0xFFFFFFFFFFFF
    int_value = (
        (time_high << 96)
        | (time_mid << 80)
        | (0x6 << 76)
        | (time_low << 64)
        | ((0x80 | ((clock_seq >> 8) & 0x3F)) << 56)
        | ((clock_seq & 0xFF) << 48)
        | node
    )
    return UUID(int=int_value)


def upgrade() -> None:
    now = datetime.now(timezone.utc)
    connection = op.get_bind()
    vitamin_k_exists = connection.scalar(
        sa.text("SELECT EXISTS (SELECT 1 FROM nutrients WHERE code = 'K1')")
    )
    if not vitamin_k_exists:
        connection.execute(
            sa.text(
                """
                INSERT INTO nutrients
                    (uuid, code, name, category, base_unit, sort_order, is_active, created_at, updated_at)
                VALUES
                    (:uuid, 'K1', 'Витамин K', 'vitamin', 'mcg', 53, true, :now, :now)
                """
            ),
            {"uuid": _uuid6(), "now": now},
        )

    op.create_table(
        "guideline_standards",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("publisher", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint("code"),
    )
    op.create_table(
        "guideline_editions",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("standard_uuid", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("import_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("source_checksum", sa.String(length=64), nullable=False),
        sa.Column("source_title", sa.String(length=500), nullable=False),
        sa.Column("source_url", sa.String(length=1000), nullable=False),
        sa.Column("publication_date", sa.String(length=32), nullable=True),
        sa.Column("language", sa.String(length=16), nullable=False),
        sa.Column("clinical_warning_ru", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('draft', 'validated', 'published', 'retired')",
            name="ck_guideline_editions_status",
        ),
        sa.ForeignKeyConstraint(
            ["standard_uuid"], ["guideline_standards.uuid"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint(
            "standard_uuid",
            "code",
            "import_version",
            name="uq_guideline_editions_identity",
        ),
    )
    op.create_index(
        "ix_guideline_editions_standard_uuid",
        "guideline_editions",
        ["standard_uuid"],
    )
    op.create_index(
        "uq_guideline_editions_one_published",
        "guideline_editions",
        ["standard_uuid"],
        unique=True,
        postgresql_where=sa.text("status = 'published'"),
    )
    op.create_table(
        "guideline_profiles",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("edition_uuid", sa.Uuid(), nullable=False),
        sa.Column("species_code", sa.String(length=16), nullable=False),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("name_ru", sa.String(length=500), nullable=False),
        sa.Column("physiological_state", sa.String(length=64), nullable=True),
        sa.Column("energy_basis_value", sa.Numeric(12, 4), nullable=False),
        sa.Column("energy_basis_unit", sa.String(length=32), nullable=False),
        sa.Column("energy_basis_type", sa.String(length=64), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.CheckConstraint(
            "species_code IN ('dog', 'cat')", name="ck_guideline_profiles_species"
        ),
        sa.ForeignKeyConstraint(
            ["edition_uuid"], ["guideline_editions.uuid"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint(
            "edition_uuid", "code", name="uq_guideline_profiles_edition_code"
        ),
    )
    op.create_index("ix_guideline_profiles_edition_uuid", "guideline_profiles", ["edition_uuid"])
    op.create_table(
        "source_references",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("edition_uuid", sa.Uuid(), nullable=False),
        sa.Column("source_url", sa.String(length=1000), nullable=False),
        sa.Column("page", sa.Integer(), nullable=True),
        sa.Column("table_code", sa.String(length=64), nullable=True),
        sa.Column("section_code", sa.String(length=128), nullable=True),
        sa.Column("row_code", sa.String(length=128), nullable=True),
        sa.Column("footnote", sa.Text(), nullable=True),
        sa.Column("source_value_text", sa.Text(), nullable=True),
        sa.Column("note_ru", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["edition_uuid"], ["guideline_editions.uuid"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index("ix_source_references_edition_uuid", "source_references", ["edition_uuid"])
    op.create_table(
        "applicability_rules",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("edition_uuid", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("name_ru", sa.String(length=500), nullable=False),
        sa.Column("predicate_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("note_ru", sa.Text(), nullable=True),
        sa.Column("source_reference_uuid", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["edition_uuid"], ["guideline_editions.uuid"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["source_reference_uuid"], ["source_references.uuid"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint(
            "edition_uuid", "code", name="uq_applicability_rules_edition_code"
        ),
    )
    op.create_index("ix_applicability_rules_edition_uuid", "applicability_rules", ["edition_uuid"])
    op.create_table(
        "derived_expressions",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("edition_uuid", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("name_ru", sa.String(length=500), nullable=False),
        sa.Column("result_unit", sa.String(length=32), nullable=False),
        sa.Column("expression_type", sa.String(length=16), nullable=False),
        sa.Column("ast_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.CheckConstraint(
            "expression_type IN ('sum', 'ratio', 'formula')",
            name="ck_derived_expressions_type",
        ),
        sa.ForeignKeyConstraint(
            ["edition_uuid"], ["guideline_editions.uuid"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint(
            "edition_uuid", "code", name="uq_derived_expressions_edition_code"
        ),
    )
    op.create_index("ix_derived_expressions_edition_uuid", "derived_expressions", ["edition_uuid"])
    op.create_table(
        "energy_formulas",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("edition_uuid", sa.Uuid(), nullable=False),
        sa.Column("profile_uuid", sa.Uuid(), nullable=False),
        sa.Column("species_code", sa.String(length=16), nullable=False),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("name_ru", sa.String(length=500), nullable=False),
        sa.Column("formula_ast", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("range_ast", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("required_animal_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("result_unit", sa.String(length=64), nullable=False),
        sa.Column("applicability_rule_uuid", sa.Uuid(), nullable=True),
        sa.Column("source_reference_uuid", sa.Uuid(), nullable=True),
        sa.Column("note_ru", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.CheckConstraint(
            "species_code IN ('dog', 'cat')", name="ck_energy_formulas_species"
        ),
        sa.ForeignKeyConstraint(
            ["applicability_rule_uuid"], ["applicability_rules.uuid"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["edition_uuid"], ["guideline_editions.uuid"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["profile_uuid"], ["guideline_profiles.uuid"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["source_reference_uuid"], ["source_references.uuid"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint(
            "edition_uuid",
            "species_code",
            "code",
            name="uq_energy_formulas_edition_species_code",
        ),
    )
    op.create_index("ix_energy_formulas_edition_uuid", "energy_formulas", ["edition_uuid"])
    op.create_index("ix_energy_formulas_profile_uuid", "energy_formulas", ["profile_uuid"])
    op.create_table(
        "guideline_targets",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("edition_uuid", sa.Uuid(), nullable=False),
        sa.Column("profile_uuid", sa.Uuid(), nullable=False),
        sa.Column("nutrient_uuid", sa.Uuid(), nullable=True),
        sa.Column("derived_expression_uuid", sa.Uuid(), nullable=True),
        sa.Column("legacy_code", sa.String(length=128), nullable=False),
        sa.Column("target_status", sa.String(length=32), nullable=False),
        sa.Column("minimum_value", sa.Numeric(18, 8), nullable=True),
        sa.Column("maximum_value", sa.Numeric(18, 8), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("basis", sa.String(length=32), nullable=False),
        sa.Column("applicability_rule_uuid", sa.Uuid(), nullable=True),
        sa.Column("source_reference_uuid", sa.Uuid(), nullable=True),
        sa.Column("source_value_text", sa.Text(), nullable=True),
        sa.Column("footnote", sa.Text(), nullable=True),
        sa.Column("note_ru", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint(
            "(nutrient_uuid IS NOT NULL AND derived_expression_uuid IS NULL) OR "
            "(nutrient_uuid IS NULL AND derived_expression_uuid IS NOT NULL)",
            name="ck_guideline_targets_subject_xor",
        ),
        sa.CheckConstraint(
            "target_status IN ('established', 'not_established')",
            name="ck_guideline_targets_status",
        ),
        sa.CheckConstraint("basis = 'per_1000_kcal_me'", name="ck_guideline_targets_basis"),
        sa.ForeignKeyConstraint(
            ["applicability_rule_uuid"], ["applicability_rules.uuid"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["derived_expression_uuid"], ["derived_expressions.uuid"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["edition_uuid"], ["guideline_editions.uuid"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["nutrient_uuid"], ["nutrients.uuid"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["profile_uuid"], ["guideline_profiles.uuid"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["source_reference_uuid"], ["source_references.uuid"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index("ix_guideline_targets_edition_uuid", "guideline_targets", ["edition_uuid"])
    op.create_index("ix_guideline_targets_profile_uuid", "guideline_targets", ["profile_uuid"])
    op.create_index("ix_guideline_targets_nutrient_uuid", "guideline_targets", ["nutrient_uuid"])
    op.create_index(
        "ix_guideline_targets_derived_expression_uuid",
        "guideline_targets",
        ["derived_expression_uuid"],
    )
    op.create_index(
        "ix_guideline_targets_applicability_rule_uuid",
        "guideline_targets",
        ["applicability_rule_uuid"],
    )
    op.create_table(
        "growth_size_classes",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("edition_uuid", sa.Uuid(), nullable=False),
        sa.Column("species_code", sa.String(length=16), nullable=False),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("name_ru", sa.String(length=500), nullable=False),
        sa.Column("min_adult_weight_kg", sa.Numeric(10, 3), nullable=True),
        sa.Column("max_adult_weight_kg", sa.Numeric(10, 3), nullable=True),
        sa.Column("min_exclusive", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("max_inclusive", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("growth_curve_ast", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("min_age_weeks", sa.Integer(), nullable=True),
        sa.Column("max_age_weeks", sa.Integer(), nullable=True),
        sa.Column("source_reference_uuid", sa.Uuid(), nullable=True),
        sa.CheckConstraint(
            "species_code IN ('dog', 'cat')", name="ck_growth_size_classes_species"
        ),
        sa.ForeignKeyConstraint(
            ["edition_uuid"], ["guideline_editions.uuid"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["source_reference_uuid"], ["source_references.uuid"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint(
            "edition_uuid", "code", name="uq_growth_size_classes_edition_code"
        ),
    )
    op.create_index("ix_growth_size_classes_edition_uuid", "growth_size_classes", ["edition_uuid"])
    op.create_table(
        "lactation_factors",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("edition_uuid", sa.Uuid(), nullable=False),
        sa.Column("species_code", sa.String(length=16), nullable=False),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("factor", sa.Numeric(10, 4), nullable=False),
        sa.Column("source_reference_uuid", sa.Uuid(), nullable=True),
        sa.CheckConstraint(
            "species_code IN ('dog', 'cat')", name="ck_lactation_factors_species"
        ),
        sa.ForeignKeyConstraint(
            ["edition_uuid"], ["guideline_editions.uuid"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["source_reference_uuid"], ["source_references.uuid"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint(
            "edition_uuid",
            "species_code",
            "week",
            name="uq_lactation_factors_edition_species_week",
        ),
    )
    op.create_index("ix_lactation_factors_edition_uuid", "lactation_factors", ["edition_uuid"])


def downgrade() -> None:
    op.drop_index("ix_lactation_factors_edition_uuid", table_name="lactation_factors")
    op.drop_table("lactation_factors")
    op.drop_index("ix_growth_size_classes_edition_uuid", table_name="growth_size_classes")
    op.drop_table("growth_size_classes")
    op.drop_index(
        "ix_guideline_targets_applicability_rule_uuid", table_name="guideline_targets"
    )
    op.drop_index(
        "ix_guideline_targets_derived_expression_uuid", table_name="guideline_targets"
    )
    op.drop_index("ix_guideline_targets_nutrient_uuid", table_name="guideline_targets")
    op.drop_index("ix_guideline_targets_profile_uuid", table_name="guideline_targets")
    op.drop_index("ix_guideline_targets_edition_uuid", table_name="guideline_targets")
    op.drop_table("guideline_targets")
    op.drop_index("ix_energy_formulas_profile_uuid", table_name="energy_formulas")
    op.drop_index("ix_energy_formulas_edition_uuid", table_name="energy_formulas")
    op.drop_table("energy_formulas")
    op.drop_index("ix_derived_expressions_edition_uuid", table_name="derived_expressions")
    op.drop_table("derived_expressions")
    op.drop_index("ix_applicability_rules_edition_uuid", table_name="applicability_rules")
    op.drop_table("applicability_rules")
    op.drop_index("ix_source_references_edition_uuid", table_name="source_references")
    op.drop_table("source_references")
    op.drop_index("ix_guideline_profiles_edition_uuid", table_name="guideline_profiles")
    op.drop_table("guideline_profiles")
    op.drop_index("uq_guideline_editions_one_published", table_name="guideline_editions")
    op.drop_index("ix_guideline_editions_standard_uuid", table_name="guideline_editions")
    op.drop_table("guideline_editions")
    op.drop_table("guideline_standards")

    connection = op.get_bind()
    connection.execute(sa.text("DELETE FROM nutrient_aliases WHERE namespace = 'fediaf_legacy'"))
    connection.execute(sa.text("DELETE FROM nutrients WHERE code = 'K1'"))
