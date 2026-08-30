"""Use canonical nutrient codes in FEDIAF targets.

Revision ID: 0010_canonical_fediaf_nutrients
Revises: 0009_communications
Create Date: 2026-08-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_canonical_fediaf_nutrients"
down_revision: Union[str, Sequence[str], None] = "0009_communications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "guideline_targets",
        "legacy_code",
        new_column_name="source_code",
        existing_type=sa.String(length=128),
        existing_nullable=False,
    )
    op.drop_table("nutrient_aliases")


def downgrade() -> None:
    op.create_table(
        "nutrient_aliases",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("namespace", sa.String(length=32), nullable=False),
        sa.Column("alias", sa.String(length=255), nullable=False),
        sa.Column("nutrient_uuid", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "namespace IN ('fediaf_legacy', 'product')",
            name="ck_nutrient_aliases_namespace",
        ),
        sa.ForeignKeyConstraint(["nutrient_uuid"], ["nutrients.uuid"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint("namespace", "alias", name="uq_nutrient_aliases_namespace_alias"),
    )
    op.alter_column(
        "guideline_targets",
        "source_code",
        new_column_name="legacy_code",
        existing_type=sa.String(length=128),
        existing_nullable=False,
    )
