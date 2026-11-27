"""Encrypt clinic bot tokens and add webhook credentials and status."""

import sqlalchemy as sa
from alembic import op

from vetdietderm_api.ids import uuid6
from vetdietderm_api.owners.bot_crypto import decrypt_secret, encrypt_secret
from vetdietderm_api.settings import get_settings

revision = "0042_clinic_bot_credentials"
down_revision = "0041_revoke_owner_sessions"
branch_labels = None
depends_on = None

clinic_bots = sa.table(
    "clinic_bots",
    sa.column("clinic_id", sa.Uuid()),
    sa.column("integration_id", sa.Uuid()),
    sa.column("token", sa.Text()),
    sa.column("status", sa.String(16)),
    sa.column("last_error", sa.String(500)),
)


def upgrade() -> None:
    # PostgreSQL keeps the DDL lock until commit, including during the backfill.
    op.add_column("clinic_bots", sa.Column("integration_id", sa.Uuid(), nullable=True))
    db = op.get_bind()
    rows = db.execute(sa.select(clinic_bots.c.clinic_id, clinic_bots.c.token, clinic_bots.c.last_error)).all()
    key = get_settings().CLINIC_BOT_ENCRYPTION_KEY
    if not key and any(row.token is not None for row in rows):
        raise RuntimeError("Set CLINIC_BOT_ENCRYPTION_KEY before upgrading stored clinic bot tokens")

    op.alter_column("clinic_bots", "token", existing_type=sa.String(256), type_=sa.Text())
    op.add_column("clinic_bots", sa.Column("webhook_secret_ciphertext", sa.Text(), nullable=True))
    op.add_column("clinic_bots", sa.Column("webhook_status", sa.String(16),
                                           nullable=False, server_default="not_configured"))
    for row in rows:
        values = {"integration_id": uuid6()}
        if row.token is not None and not row.token.startswith("gAAAAA"):
            values["token"] = encrypt_secret(row.token, key)
        if row.last_error is not None:
            # Historical Telegram errors may include a rejected token that was never stored.
            values["last_error"] = "Telegram не подтвердил токен"
        db.execute(clinic_bots.update().where(clinic_bots.c.clinic_id == row.clinic_id).values(values))

    op.alter_column("clinic_bots", "integration_id", existing_type=sa.Uuid(), nullable=False)
    op.create_unique_constraint("uq_clinic_bots_integration_id", "clinic_bots", ["integration_id"])
    op.create_check_constraint("ck_clinic_bots_webhook_status", "clinic_bots",
                               "webhook_status IN ('not_configured', 'active', 'error')")
    op.drop_constraint("ck_clinic_bots_status", "clinic_bots", type_="check")
    op.create_check_constraint("ck_clinic_bots_status", "clinic_bots", "status IN ('connected', 'error', 'disconnected')")


def downgrade() -> None:
    op.drop_constraint("ck_clinic_bots_status", "clinic_bots", type_="check")
    db = op.get_bind()
    key = get_settings().CLINIC_BOT_ENCRYPTION_KEY
    rows = db.execute(sa.select(clinic_bots.c.clinic_id, clinic_bots.c.token).where(
        clinic_bots.c.token.is_not(None),
    )).all()
    if rows and not key:
        raise RuntimeError("Set CLINIC_BOT_ENCRYPTION_KEY before downgrading stored clinic bot tokens")
    for row in rows:
        token = decrypt_secret(row.token, key)
        db.execute(clinic_bots.update().where(clinic_bots.c.clinic_id == row.clinic_id).values(token=token))

    db.execute(clinic_bots.update().where(clinic_bots.c.status == "disconnected").values(status="error"))
    op.create_check_constraint("ck_clinic_bots_status", "clinic_bots", "status IN ('connected', 'error')")
    op.drop_constraint("ck_clinic_bots_webhook_status", "clinic_bots", type_="check")
    op.drop_constraint("uq_clinic_bots_integration_id", "clinic_bots", type_="unique")
    op.drop_column("clinic_bots", "webhook_status")
    op.drop_column("clinic_bots", "webhook_secret_ciphertext")
    op.drop_column("clinic_bots", "integration_id")
    op.alter_column("clinic_bots", "token", existing_type=sa.Text(), type_=sa.String(256))
