"""Durable, credential-free recovery for clinic invite transfers.

Rollback only after unfinished transfers have completed; dropping the table
otherwise discards recovery evidence for already consumed invitations.
"""
from alembic import op
import sqlalchemy as sa

revision = "0038_clinic_invite_transfers"
down_revision = "0037_clinic_entry"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "clinic_invite_transfers",
        sa.Column("user_id", sa.Uuid(), primary_key=True),
        sa.Column("invite_hash", sa.String(64), primary_key=True),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("membership_ids", sa.JSON(), nullable=False),
        sa.Column("destination_id", sa.Uuid(), nullable=True),
        sa.Column("phase", sa.String(16), nullable=False),
        sa.CheckConstraint("phase IN ('accepting', 'accepted', 'closing', 'closed', 'done')",
                           name="ck_clinic_invite_transfers_phase"),
    )


def downgrade():
    op.drop_table("clinic_invite_transfers")
