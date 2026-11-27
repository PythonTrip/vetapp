"""Store private Telegram updates in the durable transport queue."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0043_telegram_updates"
down_revision = "0042_clinic_bot_credentials"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telegram_updates",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("clinic_id", sa.Uuid(), nullable=False),
        sa.Column("integration_id", sa.Uuid(), nullable=False),
        sa.Column("bot_id", sa.BigInteger(), nullable=False),
        sa.Column("update_id", sa.BigInteger(), nullable=False),
        sa.Column("update_kind", sa.String(16), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("transport_status", sa.String(16), nullable=False, server_default="queued"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("transport_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("bot_id", "update_id", name="uq_telegram_updates_bot_update"),
        sa.CheckConstraint("update_kind IN ('message', 'edited_message')", name="ck_telegram_updates_kind"),
        sa.CheckConstraint(
            "transport_status IN ('queued', 'claimed', 'complete', 'error')",
            name="ck_telegram_updates_transport_status",
        ),
    )
    op.create_index("ix_telegram_updates_transport_created", "telegram_updates", ["transport_status", "created_at"])


def downgrade() -> None:
    op.drop_table("telegram_updates")
