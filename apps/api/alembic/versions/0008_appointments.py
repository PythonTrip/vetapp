"""Create appointments table.

Revision ID: 0008_appointments
Revises: 0007_attachments
Create Date: 2026-08-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_appointments"
down_revision: Union[str, Sequence[str], None] = "0007_attachments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "appointments",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("patient_uuid", sa.Uuid(), nullable=False),
        sa.Column("encounter_uuid", sa.Uuid(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_min", sa.Integer(), nullable=False),
        sa.Column("visit_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["patient_uuid"], ["patients.uuid"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["encounter_uuid"], ["encounters.uuid"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index("ix_appointments_patient_uuid", "appointments", ["patient_uuid"])
    op.create_index("ix_appointments_starts_at", "appointments", ["starts_at"])


def downgrade() -> None:
    op.drop_index("ix_appointments_starts_at", table_name="appointments")
    op.drop_index("ix_appointments_patient_uuid", table_name="appointments")
    op.drop_table("appointments")
