"""Track business consumption of transport-complete Telegram updates."""

import sqlalchemy as sa
from alembic import op

revision = "0046_telegram_business_consumed"
down_revision = "0045_clinic_contacts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "telegram_updates",
        sa.Column("business_consumed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_telegram_updates_business_pending",
        "telegram_updates",
        ["created_at", "uuid"],
        postgresql_where=sa.text("transport_status = 'complete' AND business_consumed_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_telegram_updates_business_pending", table_name="telegram_updates")
    op.drop_column("telegram_updates", "business_consumed_at")
