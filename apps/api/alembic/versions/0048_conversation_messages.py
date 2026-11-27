"""Store messages in clinic conversations."""

import sqlalchemy as sa
from alembic import op

revision = "0048_conversation_messages"
down_revision = "0047_clinic_contact_link_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversation_messages",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("clinic_id", sa.Uuid(), nullable=False),
        sa.Column(
            "conversation_uuid", sa.Uuid(),
            sa.ForeignKey("clinic_conversations.uuid", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("direction", sa.Text(), nullable=False),
        sa.Column("channel", sa.Text(), nullable=False),
        sa.Column("origin", sa.Text(), nullable=False, server_default="telegram"),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("bot_id", sa.BigInteger()),
        sa.Column("telegram_chat_id", sa.BigInteger()),
        sa.Column("telegram_message_id", sa.BigInteger()),
        sa.Column("source_update_id", sa.BigInteger()),
        sa.Column("edited_at", sa.DateTime(timezone=True)),
        sa.Column("body", sa.Text()),
        sa.Column("author_user_id", sa.Uuid()),
        sa.Column("author_label", sa.Text()),
        sa.Column("source_chat_message_uuid", sa.Uuid()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("direction IN ('inbound', 'outbound')", name="ck_conversation_messages_direction"),
        sa.CheckConstraint("channel = 'telegram'", name="ck_conversation_messages_channel"),
        sa.CheckConstraint("origin IN ('telegram', 'owner_cabinet')", name="ck_conversation_messages_origin"),
    )
    op.create_index(
        "uq_conversation_messages_external",
        "conversation_messages",
        ["bot_id", "telegram_chat_id", "telegram_message_id"],
        unique=True,
        postgresql_where=sa.text(
            "bot_id IS NOT NULL AND telegram_chat_id IS NOT NULL AND telegram_message_id IS NOT NULL"
        ),
    )
    op.create_index(
        "uq_conversation_messages_source",
        "conversation_messages",
        ["source_chat_message_uuid"],
        unique=True,
        postgresql_where=sa.text("source_chat_message_uuid IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_table("conversation_messages")
