"""Stable doctor codes and independent owner identity/session storage."""
from alembic import op
import sqlalchemy as sa

revision = "0023_owner_join"
down_revision = "0022_users_organizations"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("join_codes",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False, unique=True),
        sa.Column("doctor_user_id", sa.Uuid(), nullable=False),
        sa.Column("doctor_label", sa.String(255), nullable=False),
        sa.Column("workspace", sa.String(16), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=True),
        sa.Column("organization_name", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("uq_join_codes_personal", "join_codes", ["doctor_user_id"], unique=True,
                    postgresql_where=sa.text("tenant_id IS NULL"))
    op.create_index("uq_join_codes_organization", "join_codes", ["doctor_user_id", "tenant_id"], unique=True,
                    postgresql_where=sa.text("tenant_id IS NOT NULL"))
    op.create_table("owner_accounts",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("phone", sa.String(64), nullable=False),
        sa.Column("password_hash", sa.String(128), nullable=False),
        sa.Column("password_salt", sa.String(64), nullable=False),
        sa.Column("doctor_user_id", sa.Uuid(), nullable=False),
        sa.Column("join_code_uuid", sa.Uuid(), sa.ForeignKey("join_codes.uuid"), nullable=False),
        sa.Column("workspace", sa.String(16), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("owner_sessions",
        sa.Column("key_hash", sa.String(64), primary_key=True),
        sa.Column("owner_account_uuid", sa.Uuid(), sa.ForeignKey("owner_accounts.uuid", ondelete="CASCADE"), nullable=False),
        sa.Column("expires", sa.Float(), nullable=False))
    op.create_index("ix_owner_sessions_expires", "owner_sessions", ["expires"])
    op.create_table("staff_email_reservations",
        sa.Column("email", sa.String(255), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("owner_registrations",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("owner_account_uuid", sa.Uuid(), sa.ForeignKey("owner_accounts.uuid"), nullable=False, unique=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("owner_registrations")
    op.drop_table("staff_email_reservations")
    op.drop_table("owner_sessions")
    op.drop_table("owner_accounts")
    op.drop_table("join_codes")
