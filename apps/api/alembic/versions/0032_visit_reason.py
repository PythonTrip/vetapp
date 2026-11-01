"""Preserve the owner's reason even when a visit has no questionnaire."""
from alembic import op
import sqlalchemy as sa

revision = "0032_visit_reason"
down_revision = "0031_owner_quick_start"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("visit_requests", sa.Column("reason", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("visit_requests", "reason")
