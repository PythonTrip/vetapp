"""One published questionnaire per clinic and bookable visit type."""
from alembic import op
import sqlalchemy as sa

revision = "0036_clinic_questionnaires"
down_revision = "0035_clinic_bots"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("visit_questionnaires", sa.Column("tenant_id", sa.Uuid(), nullable=True))
    op.create_index(
        "uq_visit_questionnaires_clinic_type",
        "visit_questionnaires",
        ["tenant_id", "visit_type"],
        unique=True,
        postgresql_where=sa.text("tenant_id IS NOT NULL"),
    )


def downgrade():
    op.drop_index("uq_visit_questionnaires_clinic_type", table_name="visit_questionnaires")
    op.drop_column("visit_questionnaires", "tenant_id")
