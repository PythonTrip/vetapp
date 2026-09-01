"""Archive SQL-backed nutrition runtime tables.

Revision ID: 0019_archive_guideline_runtime_tables
Revises: 0018_repair_diet_plan_energy_adjustment
Create Date: 2026-09-01

FEDIAF/NRC/AAFCO normative data and executable rules are provider-owned after
this revision. Existing rows are moved intact to an archive schema instead of
being dropped, so rollback remains lossless. Only standard/edition metadata
stays in ``public``.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0019_archive_guideline_runtime_tables"
down_revision: Union[str, Sequence[str], None] = "0018_repair_diet_plan_energy_adjustment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ARCHIVE_SCHEMA = "legacy_guidelines"
RUNTIME_TABLES = (
    "guideline_targets",
    "energy_formulas",
    "lactation_factors",
    "growth_size_classes",
    "applicability_rules",
    "derived_expressions",
    "source_references",
    "guideline_profiles",
)


def upgrade() -> None:
    op.execute(f'CREATE SCHEMA IF NOT EXISTS "{ARCHIVE_SCHEMA}"')
    for table in RUNTIME_TABLES:
        op.execute(f'ALTER TABLE public."{table}" SET SCHEMA "{ARCHIVE_SCHEMA}"')


def downgrade() -> None:
    for table in reversed(RUNTIME_TABLES):
        op.execute(f'ALTER TABLE "{ARCHIVE_SCHEMA}"."{table}" SET SCHEMA public')
    op.execute(f'DROP SCHEMA "{ARCHIVE_SCHEMA}"')
