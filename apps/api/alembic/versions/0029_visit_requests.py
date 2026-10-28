"""Owner visit requests remain outside appointments until staff confirmation."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0029_visit_requests"
down_revision = "0028_visit_questionnaires"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("visit_requests",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("owner_account_uuid", sa.Uuid(), sa.ForeignKey("owner_accounts.uuid"), nullable=False),
        sa.Column("owner_animal_uuid", sa.Uuid(), sa.ForeignKey("owner_animals.uuid", ondelete="SET NULL")),
        sa.Column("patient_uuid", sa.Uuid(), sa.ForeignKey("patients.uuid", ondelete="SET NULL")),
        sa.Column("appointment_uuid", sa.Uuid(), sa.ForeignKey("appointments.uuid", ondelete="SET NULL"), unique=True),
        sa.Column("visit_type", sa.String(16), nullable=False),
        sa.Column("proposed_starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_starts_at", sa.DateTime(timezone=True)),
        sa.Column("duration_min", sa.Integer()),
        sa.Column("status", sa.String(16), nullable=False, server_default="requested"),
        sa.Column("rejection_reason", sa.String(500)),
        sa.Column("answers", JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_visit_requests_owner_account_uuid", "visit_requests", ["owner_account_uuid"])
    op.create_index("ix_visit_requests_status", "visit_requests", ["status"])
    op.create_table("visit_request_files",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("request_uuid", sa.Uuid(), sa.ForeignKey("visit_requests.uuid", ondelete="CASCADE"), nullable=False),
        sa.Column("storage_key", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(64), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("gallery_copied", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_visit_request_files_request_uuid", "visit_request_files", ["request_uuid"])


def downgrade():
    op.drop_table("visit_request_files")
    op.drop_table("visit_requests")
