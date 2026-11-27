"""Add a nullable Patient tag to conversation messages."""

import sqlalchemy as sa
from alembic import op

revision = "0050_message_patient_tag"
down_revision = "0049_conversation_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversation_messages", sa.Column("patient_uuid", sa.Uuid()))
    op.create_foreign_key(
        "fk_conversation_messages_patient", "conversation_messages", "patients",
        ["patient_uuid"], ["uuid"], ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_conversation_messages_patient", "conversation_messages", type_="foreignkey")
    op.drop_column("conversation_messages", "patient_uuid")
