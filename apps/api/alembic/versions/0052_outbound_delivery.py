"""Store a durable queue for outbound Telegram messages."""

import sqlalchemy as sa
from alembic import op

revision = "0052_outbound_delivery"
down_revision = "0051_owner_chat_history"
branch_labels = None
depends_on = None

TABLE = "conversation_messages"


def upgrade() -> None:
    op.add_column(TABLE, sa.Column("delivery_status", sa.Text()))
    op.add_column(TABLE, sa.Column("delivery_attempt_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column(TABLE, sa.Column("next_attempt_at", sa.DateTime(timezone=True)))
    op.add_column(TABLE, sa.Column("idempotency_key", sa.Text()))
    op.add_column(TABLE, sa.Column("target_bot_id", sa.BigInteger()))
    op.add_column(TABLE, sa.Column("delivery_error", sa.Text()))
    op.create_check_constraint(
        "ck_conversation_messages_delivery_status", TABLE,
        "delivery_status IN ('queued', 'sent', 'failed', 'unconfirmed')",
    )
    op.create_index(
        "uq_conversation_messages_idempotency", TABLE, ["conversation_uuid", "idempotency_key"],
        unique=True, postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )
    op.create_index(
        "ix_conversation_messages_delivery_queue", TABLE, ["created_at", "uuid"],
        postgresql_where=sa.text("delivery_status = 'queued'"),
    )


def downgrade() -> None:
    op.drop_index("ix_conversation_messages_delivery_queue", table_name=TABLE)
    op.drop_index("uq_conversation_messages_idempotency", table_name=TABLE)
    op.drop_constraint("ck_conversation_messages_delivery_status", TABLE, type_="check")
    for column in (
        "delivery_error", "target_bot_id", "idempotency_key", "next_attempt_at",
        "delivery_attempt_count", "delivery_status",
    ):
        op.drop_column(TABLE, column)
