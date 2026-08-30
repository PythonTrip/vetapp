"""Create saved diet plan snapshots.

Revision ID: 0005_diet_plans
Revises: 0004_fediaf_guidelines
Create Date: 2026-08-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_diet_plans"
down_revision: Union[str, Sequence[str], None] = "0004_fediaf_guidelines"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "diet_plans",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("patient_uuid", sa.Uuid(), nullable=True),
        sa.Column("ration_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "assessment_snapshot_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["patient_uuid"], ["patients.uuid"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index("ix_diet_plans_patient_uuid", "diet_plans", ["patient_uuid"])
    op.create_index("ix_diet_plans_updated_at", "diet_plans", ["updated_at"])


def downgrade() -> None:
    op.drop_index("ix_diet_plans_updated_at", table_name="diet_plans")
    op.drop_index("ix_diet_plans_patient_uuid", table_name="diet_plans")
    op.drop_table("diet_plans")
