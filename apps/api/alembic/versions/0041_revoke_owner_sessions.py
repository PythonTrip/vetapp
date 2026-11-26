"""Revoke every owner cabinet session after the Owner Cabinet runtime removal.

Only transient authentication rows are deleted (sessions and Telegram replay
records). Owner accounts, registrations, animals, visits, chat, attachments and
clinic bots are kept. Downgrade is a no-op: revoked sessions cannot be restored.
"""
from alembic import op

revision = "0041_revoke_owner_sessions"
down_revision = "visit_charge"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("DELETE FROM owner_sessions")
    op.execute("DELETE FROM owner_telegram_exchanges")


def downgrade():
    pass
