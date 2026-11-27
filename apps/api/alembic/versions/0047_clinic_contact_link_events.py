"""Record clinic contact client link changes."""

import sqlalchemy as sa
from alembic import op

revision = "0047_clinic_contact_link_events"
down_revision = "0046_telegram_business_consumed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clinic_contact_link_events",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("clinic_id", sa.Uuid(), nullable=False),
        sa.Column(
            "contact_uuid", sa.Uuid(),
            sa.ForeignKey("clinic_contacts.uuid", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("actor_user_id", sa.Uuid(), nullable=False),
        sa.Column("actor_label", sa.Text(), nullable=False),
        sa.Column("previous_client_uuid", sa.Uuid()),
        sa.Column("new_client_uuid", sa.Uuid()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_clinic_contact_link_events_contact_history",
        "clinic_contact_link_events",
        ["contact_uuid", "clinic_id", "created_at", "uuid"],
    )


def downgrade() -> None:
    op.drop_table("clinic_contact_link_events")
