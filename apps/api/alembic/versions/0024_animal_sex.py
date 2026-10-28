"""Patient sex and owner passports awaiting clinician acceptance."""
from alembic import op
import sqlalchemy as sa

revision = "0024_animal_sex"
down_revision = "0023_owner_join"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("patients", sa.Column("sex", sa.String(16), nullable=False, server_default="unspecified"))
    op.create_table("owner_animals",
        sa.Column("uuid", sa.Uuid(), primary_key=True),
        sa.Column("registration_uuid", sa.Uuid(), sa.ForeignKey("owner_registrations.uuid"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("species", sa.String(16), nullable=False),
        sa.Column("breed", sa.String(255), nullable=False, server_default=""),
        sa.Column("sex", sa.String(16), nullable=False, server_default="unspecified"),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_owner_animals_registration_uuid", "owner_animals", ["registration_uuid"])


def downgrade():
    op.drop_table("owner_animals")
    op.drop_column("patients", "sex")
