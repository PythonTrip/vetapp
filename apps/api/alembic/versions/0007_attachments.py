"""Create attachment metadata table.

Revision ID: 0007_attachments
Revises: 0006_encounters
Create Date: 2026-08-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_attachments"
down_revision: Union[str, Sequence[str], None] = "0006_encounters"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "attachments",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("patient_uuid", sa.Uuid(), nullable=False),
        sa.Column("encounter_uuid", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("body_region", sa.String(length=128), nullable=True),
        sa.Column("vas_score", sa.Integer(), nullable=True),
        sa.Column("content_type", sa.String(length=128), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["patient_uuid"], ["patients.uuid"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["encounter_uuid"], ["encounters.uuid"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index("ix_attachments_patient_uuid", "attachments", ["patient_uuid"])
    op.create_index("ix_attachments_encounter_uuid", "attachments", ["encounter_uuid"])


def downgrade() -> None:
    op.drop_index("ix_attachments_encounter_uuid", table_name="attachments")
    op.drop_index("ix_attachments_patient_uuid", table_name="attachments")
    op.drop_table("attachments")
