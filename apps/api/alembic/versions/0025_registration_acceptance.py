"""Link owner registrations and passports to clinical records."""
from alembic import op
import sqlalchemy as sa

revision = "0025_registration_acceptance"
down_revision = "0024_animal_sex"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("owner_registrations", sa.Column("client_uuid", sa.Uuid(), nullable=True))
    op.add_column("owner_registrations", sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_owner_registration_client", "owner_registrations", "clients", ["client_uuid"], ["uuid"], ondelete="RESTRICT")
    op.add_column("owner_animals", sa.Column("patient_uuid", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_owner_animal_patient", "owner_animals", "patients", ["patient_uuid"], ["uuid"], ondelete="SET NULL")


def downgrade():
    op.drop_constraint("fk_owner_animal_patient", "owner_animals", type_="foreignkey")
    op.drop_column("owner_animals", "patient_uuid")
    op.drop_constraint("fk_owner_registration_client", "owner_registrations", type_="foreignkey")
    op.drop_column("owner_registrations", "accepted_at")
    op.drop_column("owner_registrations", "client_uuid")
