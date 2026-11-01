"""Persistent pet photos, owner documents and message attachments."""
from alembic import op
import sqlalchemy as sa

revision = "0033_owner_uploads"
down_revision = "0032_visit_reason"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("owner_uploads",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("owner_account_uuid", sa.Uuid(), sa.ForeignKey("owner_accounts.uuid", ondelete="CASCADE"), nullable=False),
        sa.Column("animal_uuid", sa.Uuid(), nullable=False),
        sa.Column("message_uuid", sa.Uuid(), sa.ForeignKey("chat_messages.uuid", ondelete="CASCADE"), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("storage_key", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('photo', 'document', 'chat')", name="ck_owner_upload_kind"))
    for column in ("owner_account_uuid", "animal_uuid", "message_uuid"):
        op.create_index(f"ix_owner_uploads_{column}", "owner_uploads", [column])


def downgrade():
    op.drop_table("owner_uploads")
