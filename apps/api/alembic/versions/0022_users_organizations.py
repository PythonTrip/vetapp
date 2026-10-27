"""Isolate clinical records and store opaque browser sessions.

Legacy NULL tenant records stay inaccessible. Shared standard templates remain readable.
"""
from alembic import op
import sqlalchemy as sa

revision = "0022_users_organizations"
down_revision = "0021_clinical_form_builder"
branch_labels = None
depends_on = None
TABLES = ("clients", "patients", "appointments", "encounters", "attachments",
          "communications", "diet_plans", "encounter_templates", "clinical_catalog_items")


def upgrade():
    for table in TABLES:
        op.add_column(table, sa.Column("tenant_id", sa.Uuid(), nullable=True))
        op.add_column(table, sa.Column("created_by", sa.Uuid(), nullable=True))
        op.create_index(f"ix_{table}_tenant_id", table, ["tenant_id"])
    op.create_table("browser_sessions",
        sa.Column("key_hash", sa.String(64), primary_key=True),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("access_expires", sa.Float(), nullable=False),
        sa.Column("expires", sa.Float(), nullable=False))
    op.create_index("ix_browser_sessions_expires", "browser_sessions", ["expires"])


def downgrade():
    # Combining tenants into the old unscoped application would expose their data.
    raise RuntimeError("Multi-tenant downgrade requires an explicit data export and isolation plan")
