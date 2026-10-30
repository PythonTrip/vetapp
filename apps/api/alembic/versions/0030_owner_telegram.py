"""Verified Telegram identities and single-use exchanges."""
from alembic import op
import sqlalchemy as sa

revision = "0030_owner_telegram"
down_revision = "0029_visit_requests"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("owner_telegram_identities",
        sa.Column("telegram_user_id", sa.String(20), primary_key=True),
        sa.Column("owner_account_uuid", sa.Uuid(), sa.ForeignKey("owner_accounts.uuid", ondelete="CASCADE"), nullable=False, unique=True))
    op.create_table("owner_telegram_exchanges",
        sa.Column("digest", sa.String(64), primary_key=True),
        sa.Column("expires", sa.Float(), nullable=False))
    op.create_index("ix_owner_telegram_exchanges_expires", "owner_telegram_exchanges", ["expires"])


def downgrade():
    op.drop_table("owner_telegram_exchanges")
    op.drop_table("owner_telegram_identities")
