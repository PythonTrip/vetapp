"""One published question list per doctor and bookable visit type."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0028_visit_questionnaires"
down_revision = "0027_owner_file_visibility"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("visit_questionnaires",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("doctor_user_id", sa.Uuid(), nullable=False),
        sa.Column("visit_type", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("doctor_user_id", "visit_type"))
    op.create_table("visit_questions",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("questionnaire_uuid", sa.Uuid(), sa.ForeignKey(
            "visit_questionnaires.uuid", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("label", sa.String(500), nullable=False),
        sa.Column("options", JSONB(), nullable=False, server_default="[]"),
        sa.UniqueConstraint("questionnaire_uuid", "position"))


def downgrade():
    op.drop_table("visit_questions")
    op.drop_table("visit_questionnaires")
