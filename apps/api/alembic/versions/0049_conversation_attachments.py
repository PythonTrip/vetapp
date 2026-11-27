"""Store attachment metadata on conversation messages."""

import sqlalchemy as sa
from alembic import op

revision = "0049_conversation_attachments"
down_revision = "0048_conversation_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversation_messages", sa.Column("attachment_storage_key", sa.Text()))
    op.add_column("conversation_messages", sa.Column("attachment_content_type", sa.Text()))
    op.add_column("conversation_messages", sa.Column("attachment_byte_size", sa.BigInteger()))
    op.add_column("conversation_messages", sa.Column(
        "unsupported_attachment", sa.Boolean(), nullable=False, server_default=sa.false(),
    ))


def downgrade() -> None:
    op.drop_column("conversation_messages", "unsupported_attachment")
    op.drop_column("conversation_messages", "attachment_byte_size")
    op.drop_column("conversation_messages", "attachment_content_type")
    op.drop_column("conversation_messages", "attachment_storage_key")
