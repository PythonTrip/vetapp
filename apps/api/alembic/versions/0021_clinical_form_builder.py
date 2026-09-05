"""Add structured clinical form builder catalog.

Revision ID: 0021_clinical_form_builder
Revises: 0020_canonical_nutrient_units
Create Date: 2026-09-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0021_clinical_form_builder"
down_revision: Union[str, Sequence[str], None] = "0020_canonical_nutrient_units"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "encounter_templates",
        sa.Column("definition", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_table(
        "clinical_catalog_items",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("specialty", sa.String(length=32), nullable=True),
        sa.Column("key", sa.String(length=160), nullable=False),
        sa.Column("label", sa.String(length=160), nullable=False),
        sa.Column("definition", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("doctor_name", sa.String(length=160), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('field', 'section')", name="ck_clinical_catalog_kind"),
        sa.CheckConstraint("scope IN ('clinic', 'doctor')", name="ck_clinical_catalog_scope"),
        sa.CheckConstraint(
            "specialty IS NULL OR specialty IN ('dermatology', 'nutrition', 'general')",
            name="ck_clinical_catalog_specialty",
        ),
        sa.CheckConstraint(
            "scope != 'doctor' OR doctor_name IS NOT NULL",
            name="ck_clinical_catalog_doctor",
        ),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index(
        "ix_clinical_catalog_lookup",
        "clinical_catalog_items",
        ["kind", "scope", "specialty"],
    )
    op.create_index("ix_clinical_catalog_owner", "clinical_catalog_items", ["doctor_name"])


def downgrade() -> None:
    op.drop_index("ix_clinical_catalog_owner", table_name="clinical_catalog_items")
    op.drop_index("ix_clinical_catalog_lookup", table_name="clinical_catalog_items")
    op.drop_table("clinical_catalog_items")
    op.drop_column("encounter_templates", "definition")
