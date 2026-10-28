"""Gallery files stay clinician-only until the clinician shares them.

Downgrade drops owner_visible and uploaded_by_owner. Stored bytes are kept.
Existing rows receive false for both flags, so linking a client does not
publish the old gallery.
"""
from alembic import op
import sqlalchemy as sa

revision = "0027_owner_file_visibility"
down_revision = "0026_animal_chat"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "attachments",
        sa.Column("owner_visible", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "attachments",
        sa.Column("uploaded_by_owner", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("attachments", "uploaded_by_owner")
    op.drop_column("attachments", "owner_visible")
