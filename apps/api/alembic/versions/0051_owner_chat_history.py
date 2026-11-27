"""Copy Owner Cabinet chat history into clinic conversations."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.orm import Session

from vetdietderm_api.messaging.migrate_owner_chats import migrate_owner_cabinet_chats

revision = "0051_owner_chat_history"
down_revision = "0050_message_patient_tag"
branch_labels = None
depends_on = None

_ROWS = """
    SELECT 'message' AS kind, uuid FROM conversation_messages
    WHERE source_chat_message_uuid IS NOT NULL
    UNION ALL SELECT 'conversation', uuid FROM clinic_conversations
    UNION ALL SELECT 'contact', uuid FROM clinic_contacts
"""


def upgrade() -> None:
    op.create_table(
        "owner_chat_history_rows",
        sa.Column("kind", sa.Text(), primary_key=True),
        sa.Column("uuid", sa.Uuid(), primary_key=True),
    )
    # Keep the before/after difference isolated from live Telegram intake.
    op.execute("LOCK TABLE clinic_contacts, clinic_conversations, conversation_messages IN SHARE ROW EXCLUSIVE MODE")
    op.execute(f"CREATE TEMP TABLE owner_chat_history_before ON COMMIT DROP AS {_ROWS}")
    with Session(bind=op.get_bind()) as session:
        migrate_owner_cabinet_chats(session)
    op.execute(f"""
        INSERT INTO owner_chat_history_rows (kind, uuid)
        {_ROWS}
        EXCEPT SELECT kind, uuid FROM owner_chat_history_before
    """)
    op.execute("DROP TABLE owner_chat_history_before")


def downgrade() -> None:
    op.execute("""
        LOCK TABLE clinic_contacts, clinic_conversations, conversation_messages, clinic_contact_link_events
        IN SHARE ROW EXCLUSIVE MODE
    """)
    op.execute("""
        DELETE FROM conversation_messages AS message
        USING owner_chat_history_rows AS migrated
        WHERE migrated.kind = 'message' AND migrated.uuid = message.uuid
          AND message.source_chat_message_uuid IS NOT NULL AND message.origin = 'owner_cabinet'
    """)
    op.execute("""
        DELETE FROM clinic_conversations AS conversation
        USING owner_chat_history_rows AS migrated
        WHERE migrated.kind = 'conversation' AND migrated.uuid = conversation.uuid
          AND NOT EXISTS (
              SELECT 1 FROM conversation_messages AS message WHERE message.conversation_uuid = conversation.uuid
          )
    """)
    op.execute("""
        DELETE FROM clinic_contacts AS contact
        USING owner_chat_history_rows AS migrated
        WHERE migrated.kind = 'contact' AND migrated.uuid = contact.uuid
          AND NOT EXISTS (SELECT 1 FROM clinic_conversations WHERE contact_uuid = contact.uuid)
          AND NOT EXISTS (SELECT 1 FROM clinic_contact_link_events WHERE contact_uuid = contact.uuid)
    """)
    op.drop_table("owner_chat_history_rows")
