"""Create communications table.

Revision ID: 0009_communications
Revises: 0008_appointments
Create Date: 2026-08-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_communications"
down_revision: Union[str, Sequence[str], None] = "0008_appointments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "communications",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("patient_uuid", sa.Uuid(), nullable=False),
        sa.Column("client_uuid", sa.Uuid(), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False),
        sa.Column("direction", sa.String(length=16), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("follow_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["patient_uuid"], ["patients.uuid"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_uuid"], ["clients.uuid"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index("ix_communications_patient_uuid", "communications", ["patient_uuid"])
    op.create_index("ix_communications_client_uuid", "communications", ["client_uuid"])
    op.create_index("ix_communications_occurred_at", "communications", ["occurred_at"])


def downgrade() -> None:
    op.drop_index("ix_communications_occurred_at", table_name="communications")
    op.drop_index("ix_communications_client_uuid", table_name="communications")
    op.drop_index("ix_communications_patient_uuid", table_name="communications")
    op.drop_table("communications")
