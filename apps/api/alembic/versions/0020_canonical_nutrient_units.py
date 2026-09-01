"""Canonicalize mineral units and iodine code.

Revision ID: 0020_canonical_nutrient_units
Revises: 0019_archive_guideline_runtime_tables
Create Date: 2026-09-01
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0020_canonical_nutrient_units"
down_revision: Union[str, Sequence[str], None] = "0019_archive_guideline_runtime_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


VITAMIN_NAMES = {
    "B1": "Витамин B1 (тиамин)",
    "B2": "Витамин B2 (рибофлавин)",
    "B3": "Витамин B3 (ниацин)",
    "B4": "Холин",
    "B5": "Витамин B5 (пантотеновая кислота)",
    "B6": "Витамин B6 (пиридоксин)",
    "B7": "Витамин B7 (биотин)",
    "B9": "Витамин B9 (фолиевая кислота)",
    "B12": "Витамин B12 (цианокобаламин)",
}


def upgrade() -> None:
    op.execute("UPDATE nutrients SET code = 'I', base_unit = 'mg' WHERE code = 'J'")
    op.execute("UPDATE nutrients SET base_unit = 'mg' WHERE code = 'I'")
    op.execute("UPDATE nutrients SET base_unit = 'mcg' WHERE code = 'Se'")
    for code, name in VITAMIN_NAMES.items():
        escaped_name = name.replace("'", "''")
        op.execute(f"UPDATE nutrients SET name = '{escaped_name}' WHERE code = '{code}'")


def downgrade() -> None:
    for code in VITAMIN_NAMES:
        op.execute(f"UPDATE nutrients SET name = 'Витамин {code}' WHERE code = '{code}'")
    op.execute("UPDATE nutrients SET code = 'J', base_unit = 'mcg' WHERE code = 'I'")
