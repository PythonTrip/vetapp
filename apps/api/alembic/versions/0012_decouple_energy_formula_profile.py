"""Decouple energy formulas from nutrient profiles.

Revision ID: 0012_decouple_energy_formula_profile
Revises: 0011_encounter_templates
Create Date: 2026-08-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012_decouple_energy_formula_profile"
down_revision: Union[str, Sequence[str], None] = "0011_encounter_templates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "alembic_version",
        "version_num",
        existing_type=sa.String(length=32),
        type_=sa.String(length=64),
        existing_nullable=False,
    )
    op.alter_column("energy_formulas", "profile_uuid", existing_type=sa.Uuid(), nullable=True)
    op.add_column(
        "energy_formulas",
        sa.Column("result_kind", sa.String(length=16), nullable=False, server_default="point"),
    )
    op.add_column(
        "energy_formulas",
        sa.Column(
            "allowed_weight_bases",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[\"current\"]'::jsonb"),
        ),
    )
    op.create_check_constraint(
        "ck_energy_formulas_result_kind",
        "energy_formulas",
        "result_kind IN ('point', 'range')",
    )
    op.add_column(
        "guideline_profiles",
        sa.Column(
            "calculation_basis",
            sa.String(length=40),
            nullable=False,
            server_default="published_per_1000_kcal",
        ),
    )
    op.create_check_constraint(
        "ck_guideline_profiles_calculation_basis",
        "guideline_profiles",
        "calculation_basis IN ('published_per_1000_kcal', 'daily_per_metabolic_bw')",
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE energy_formulas AS formula
        SET profile_uuid = (
            SELECT profile.uuid
            FROM guideline_profiles AS profile
            WHERE profile.edition_uuid = formula.edition_uuid
              AND profile.species_code = formula.species_code
            ORDER BY profile.code
            LIMIT 1
        )
        WHERE formula.profile_uuid IS NULL
        """
    )
    op.drop_constraint(
        "ck_guideline_profiles_calculation_basis",
        "guideline_profiles",
        type_="check",
    )
    op.drop_column("guideline_profiles", "calculation_basis")
    op.drop_constraint("ck_energy_formulas_result_kind", "energy_formulas", type_="check")
    op.drop_column("energy_formulas", "allowed_weight_bases")
    op.drop_column("energy_formulas", "result_kind")
    op.alter_column("energy_formulas", "profile_uuid", existing_type=sa.Uuid(), nullable=False)
