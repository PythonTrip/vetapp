"""Create clinic contacts and their conversations."""

import sqlalchemy as sa
from alembic import op

revision = "0045_clinic_contacts"
down_revision = "0044_drop_communications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clinic_contacts",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("clinic_id", sa.Uuid(), nullable=False),
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=False),
        sa.Column("telegram_chat_id", sa.BigInteger(), nullable=False),
        sa.Column("profile_name", sa.Text()),
        sa.Column("username", sa.Text()),
        sa.Column("local_name", sa.Text(), nullable=False),
        sa.Column("client_uuid", sa.Uuid(), sa.ForeignKey("clients.uuid", ondelete="RESTRICT")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("clinic_id", "telegram_user_id", name="uq_clinic_contacts_user"),
        sa.UniqueConstraint("clinic_id", "telegram_chat_id", name="uq_clinic_contacts_chat"),
    )
    op.create_table(
        "clinic_conversations",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("clinic_id", sa.Uuid(), nullable=False),
        sa.Column(
            "contact_uuid", sa.Uuid(),
            sa.ForeignKey("clinic_contacts.uuid", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("clinic_id", "contact_uuid", name="uq_clinic_conversations_contact"),
    )


def downgrade() -> None:
    op.drop_table("clinic_conversations")
    op.drop_table("clinic_contacts")
