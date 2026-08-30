"""Add the VII-11 daily nutrient-standard basis.

Revision ID: 0013_vii11_daily_basis
Revises: 0012_decouple_energy_formula_profile
Create Date: 2026-08-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_vii11_daily_basis"
down_revision: Union[str, Sequence[str], None] = "0012_decouple_energy_formula_profile"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_guideline_targets_basis", "guideline_targets", type_="check")
    op.create_check_constraint(
        "ck_guideline_targets_basis",
        "guideline_targets",
        "basis IN ('per_1000_kcal_me', 'daily_per_metabolic_bw')",
    )
    op.add_column(
        "guideline_profiles",
        sa.Column(
            "clinician_selectable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "source_references",
        sa.Column(
            "source_language",
            sa.String(length=16),
            nullable=False,
            server_default="en",
        ),
    )


def downgrade() -> None:
    op.drop_column("source_references", "source_language")
    op.drop_column("guideline_profiles", "clinician_selectable")
    op.drop_constraint("ck_guideline_targets_basis", "guideline_targets", type_="check")
    op.create_check_constraint(
        "ck_guideline_targets_basis",
        "guideline_targets",
        "basis = 'per_1000_kcal_me'",
    )
