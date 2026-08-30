"""Preserve range-only energy formulas without a synthetic point AST.

Revision ID: 0014_energy_formula_range_semantics
Revises: 0013_vii11_daily_basis
Create Date: 2026-08-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014_energy_formula_range_semantics"
down_revision: Union[str, Sequence[str], None] = "0013_vii11_daily_basis"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "energy_formulas",
        "formula_ast",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        nullable=True,
    )
    op.execute(
        """
        UPDATE energy_formulas
        SET formula_ast = NULL
        WHERE result_kind = 'range' OR formula_ast = 'null'::jsonb
        """
    )
    op.create_check_constraint(
        "ck_energy_formulas_executable_result",
        "energy_formulas",
        "(result_kind = 'point' AND formula_ast IS NOT NULL "
        "AND formula_ast <> 'null'::jsonb) OR "
        "(result_kind = 'range' AND range_ast IS NOT NULL "
        "AND range_ast <> 'null'::jsonb)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_energy_formulas_executable_result",
        "energy_formulas",
        type_="check",
    )
    op.execute(
        """
        UPDATE energy_formulas
        SET formula_ast = COALESCE(range_ast -> 'min', range_ast -> 'max')
        WHERE formula_ast IS NULL
        """
    )
    op.alter_column(
        "energy_formulas",
        "formula_ast",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        nullable=False,
    )
