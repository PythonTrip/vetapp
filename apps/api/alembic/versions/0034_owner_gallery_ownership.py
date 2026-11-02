"""Repair workspace provenance for owner-uploaded gallery copies."""
from alembic import op
import sqlalchemy as sa

revision = "0034_owner_gallery_ownership"
down_revision = "0033_owner_uploads"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text("""
        UPDATE attachments
        SET tenant_id = patients.tenant_id, created_by = patients.created_by
        FROM patients
        WHERE attachments.patient_uuid = patients.uuid
          AND attachments.uploaded_by_owner IS TRUE
          AND attachments.tenant_id IS NULL
          AND attachments.created_by IS NULL
          AND patients.created_by IS NOT NULL
    """))


def downgrade():
    # Removing provenance would hide copies created by the fixed writer.
    pass
