"""Create clients and patients tables.

Revision ID: 0002_clients_patients
Revises: 0001_baseline
Create Date: 2026-08-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_clients_patients"
down_revision: Union[str, Sequence[str], None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("uuid"),
        sa.Index("ix_clients_name", "name"),
    )

    op.create_table(
        "patients",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("client_uuid", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("species", sa.String(length=16), nullable=False),
        sa.Column("breed", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("body_weight_kg", sa.Numeric(10, 3), nullable=True),
        sa.Column("expected_adult_weight_kg", sa.Numeric(10, 3), nullable=True),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("life_stage", sa.String(length=64), nullable=True),
        sa.Column("activity", sa.String(length=64), nullable=True),
        sa.Column("neutered", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("pregnant", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("lactating", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("lactation_week", sa.Integer(), nullable=True),
        sa.Column("litter_size", sa.Integer(), nullable=True),
        sa.Column("bcs", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["client_uuid"], ["clients.uuid"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("uuid"),
        sa.Index("ix_patients_name", "name"),
        sa.Index("ix_patients_client_uuid", "client_uuid"),
    )


def downgrade() -> None:
    op.drop_table("patients")
    op.drop_table("clients")
