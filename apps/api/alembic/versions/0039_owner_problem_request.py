"""Allow requests without a staff classification.

Downgrade requires classifying or removing null-type requests first.
"""
from alembic import op
import sqlalchemy as sa

revision = "0039_owner_problem_request"
down_revision = "0038_clinic_invite_transfers"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("visit_requests", "visit_type", existing_type=sa.String(16), nullable=True)


def downgrade():
    op.alter_column("visit_requests", "visit_type", existing_type=sa.String(16), nullable=False)
