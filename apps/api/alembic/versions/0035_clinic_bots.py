"""One Telegram bot credential per clinic."""
from alembic import op
import sqlalchemy as sa

revision = "0035_clinic_bots"
down_revision = "0034_owner_gallery_ownership"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("clinic_bots",
        sa.Column("clinic_id", sa.Uuid(), primary_key=True),
        sa.Column("token", sa.String(256), nullable=True),
        sa.Column("bot_id", sa.BigInteger(), nullable=True),
        sa.Column("username", sa.String(64), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("last_error", sa.String(500), nullable=True),
        sa.CheckConstraint("status IN ('connected', 'error')", name="ck_clinic_bots_status"),
        sa.UniqueConstraint("bot_id", name="uq_clinic_bots_bot_id"))


def downgrade():
    op.drop_table("clinic_bots")
