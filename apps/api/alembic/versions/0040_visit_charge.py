"""One manual ruble amount on a conducted appointment.

Existing rows stay unchanged: amount_rub is null and paid is false.
Downgrade drops the charge columns and their check.
"""
from alembic import op
import sqlalchemy as sa

revision = "visit_charge"
down_revision = "0039_owner_problem_request"
branch_labels = None
depends_on = None

CHARGE = (
    "(amount_rub IS NULL OR amount_rub > 0) "
    "AND (NOT paid OR amount_rub IS NOT NULL) "
    "AND (paid OR amount_rub IS NULL OR status = 'completed')"
)


def upgrade():
    op.add_column("appointments", sa.Column("amount_rub", sa.Numeric(12, 2), nullable=True))
    op.add_column("appointments", sa.Column("paid", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_check_constraint("ck_appointments_charge", "appointments", CHARGE)


def downgrade():
    op.drop_constraint("ck_appointments_charge", "appointments", type_="check")
    op.drop_column("appointments", "paid")
    op.drop_column("appointments", "amount_rub")
