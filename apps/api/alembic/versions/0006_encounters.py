"""Add patient clinical notes and encounters.

Revision ID: 0006_encounters
Revises: 0005_diet_plans
Create Date: 2026-08-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_encounters"
down_revision: Union[str, Sequence[str], None] = "0005_diet_plans"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column(
            "allergies",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "patients",
        sa.Column(
            "chronic_conditions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column("patients", sa.Column("feeding_notes", sa.Text(), nullable=True))

    op.create_table(
        "encounters",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("patient_uuid", sa.Uuid(), nullable=False),
        sa.Column("specialty", sa.String(length=32), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("chief_complaint", sa.Text(), nullable=True),
        sa.Column("anamnesis", sa.Text(), nullable=True),
        sa.Column("anamnesis_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("exam", sa.Text(), nullable=True),
        sa.Column("assessment", sa.Text(), nullable=True),
        sa.Column("plan", sa.Text(), nullable=True),
        sa.Column(
            "diagnoses",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "prescriptions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("follow_up", sa.Text(), nullable=True),
        sa.Column("vas_score", sa.Integer(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["patient_uuid"], ["patients.uuid"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index("ix_encounters_patient_uuid", "encounters", ["patient_uuid"])
    op.create_index("ix_encounters_occurred_at", "encounters", ["occurred_at"])


def downgrade() -> None:
    op.drop_index("ix_encounters_occurred_at", table_name="encounters")
    op.drop_index("ix_encounters_patient_uuid", table_name="encounters")
    op.drop_table("encounters")
    op.drop_column("patients", "feeding_notes")
    op.drop_column("patients", "chronic_conditions")
    op.drop_column("patients", "allergies")
