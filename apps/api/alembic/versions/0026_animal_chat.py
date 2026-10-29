"""One text conversation per animal, retained across registration acceptance."""
from alembic import op
import sqlalchemy as sa

revision = "0026_animal_chat"
down_revision = "0025_registration_acceptance"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("chat_threads",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("owner_animal_uuid", sa.Uuid(), sa.ForeignKey("owner_animals.uuid", ondelete="CASCADE"), unique=True, nullable=True),
        sa.Column("patient_uuid", sa.Uuid(), sa.ForeignKey("patients.uuid", ondelete="CASCADE"), unique=True, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("owner_animal_uuid IS NOT NULL OR patient_uuid IS NOT NULL", name="ck_chat_thread_animal"))
    op.create_table("chat_messages",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("thread_uuid", sa.Uuid(), sa.ForeignKey("chat_threads.uuid", ondelete="CASCADE"), nullable=False),
        sa.Column("author_kind", sa.String(16), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("author_label", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("author_kind IN ('owner', 'staff')", name="ck_chat_message_author"),
        sa.CheckConstraint("length(trim(body)) > 0 AND length(body) <= 4000", name="ck_chat_message_body"))
    op.create_index("ix_chat_messages_thread_time", "chat_messages", ["thread_uuid", "created_at", "uuid"])


def downgrade():
    op.drop_index("ix_chat_messages_thread_time", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_table("chat_threads")
