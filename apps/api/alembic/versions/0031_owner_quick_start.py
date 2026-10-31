"""Allow Telegram owners to start before adding credentials or a doctor."""
from alembic import op
import sqlalchemy as sa

revision = "0031_owner_quick_start"
down_revision = "0030_owner_telegram"
branch_labels = None
depends_on = None

FIELDS = {"email": sa.String(255), "password_hash": sa.String(128),
          "password_salt": sa.String(64), "doctor_user_id": sa.Uuid(),
          "join_code_uuid": sa.Uuid(), "workspace": sa.String(16)}


def upgrade():
    with op.batch_alter_table("owner_accounts") as batch:
        for name, kind in FIELDS.items():
            batch.alter_column(name, existing_type=kind, nullable=True)


def downgrade():
    # Fail rather than destroy accounts created without email or doctor.
    with op.batch_alter_table("owner_accounts") as batch:
        for name, kind in FIELDS.items():
            batch.alter_column(name, existing_type=kind, nullable=False)
