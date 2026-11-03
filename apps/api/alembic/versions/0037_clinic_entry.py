"""Stable clinic links and clinic-scoped owner credentials."""
from alembic import op
import sqlalchemy as sa

revision = "0037_clinic_entry"
down_revision = "0036_clinic_questionnaires"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "clinic_links",
        sa.Column("clinic_id", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.String(64), sa.ForeignKey("join_codes.code"), nullable=False, unique=True),
    )
    op.drop_constraint("owner_accounts_email_key", "owner_accounts", type_="unique")
    op.create_index("uq_owner_accounts_clinic_email", "owner_accounts", ["tenant_id", "email"],
                    unique=True, postgresql_where=sa.text("tenant_id IS NOT NULL AND email IS NOT NULL"))

    identities = "owner_telegram_identities"
    op.add_column(identities, sa.Column("tenant_id", sa.Uuid()))
    op.execute("""
        UPDATE owner_telegram_identities AS identity
        SET tenant_id = owner.tenant_id
        FROM owner_accounts AS owner
        WHERE identity.owner_account_uuid = owner.uuid
    """)
    op.drop_constraint("owner_telegram_identities_pkey", identities, type_="primary")
    op.drop_constraint("owner_telegram_identities_owner_account_uuid_key", identities, type_="unique")
    op.create_primary_key("owner_telegram_identities_pkey", identities, ["owner_account_uuid"])
    op.create_unique_constraint("uq_owner_telegram_clinic_user", identities, ["tenant_id", "telegram_user_id"])


def downgrade():
    # Existing cross-clinic duplicates must be resolved before restoring global uniqueness.
    identities = "owner_telegram_identities"
    op.drop_constraint("uq_owner_telegram_clinic_user", identities, type_="unique")
    op.drop_constraint("owner_telegram_identities_pkey", identities, type_="primary")
    op.create_primary_key("owner_telegram_identities_pkey", identities, ["telegram_user_id"])
    op.create_unique_constraint("owner_telegram_identities_owner_account_uuid_key", identities, ["owner_account_uuid"])
    op.drop_column(identities, "tenant_id")
    op.drop_index("uq_owner_accounts_clinic_email", table_name="owner_accounts")
    op.create_unique_constraint("owner_accounts_email_key", "owner_accounts", ["email"])
    op.drop_table("clinic_links")
