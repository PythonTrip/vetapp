"""Canonicalize catalog ME to kcal/100 g as fed.

Revision ID: 0017_me_kcal_per_100g
Revises: 0016_resolve_assessment_context
Create Date: 2026-08-31
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0017_me_kcal_per_100g"
down_revision: Union[str, Sequence[str], None] = "0016_resolve_assessment_context"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MAX_ME_KCAL_PER_100G = "1000"


def upgrade() -> None:
    op.execute(
        """
        UPDATE food_nutrient_values AS value
        SET value = value.value / 10,
            updated_at = NOW()
        FROM nutrients AS nutrient
        WHERE value.nutrient_uuid = nutrient.uuid
          AND nutrient.code = 'ME'
          AND nutrient.base_unit = 'kcal'
          AND value.value IS NOT NULL
        """
    )
    op.execute(
        f"""
        UPDATE food_nutrient_values AS value
        SET value = NULL,
            value_status = 'unknown',
            updated_at = NOW()
        FROM nutrients AS nutrient
        WHERE value.nutrient_uuid = nutrient.uuid
          AND nutrient.code = 'ME'
          AND value.value IS NOT NULL
          AND (
              value.value < 0
              OR value.value > {MAX_ME_KCAL_PER_100G}
          )
        """
    )
    op.execute(
        """
        UPDATE nutrients
        SET base_unit = 'kcal/100g',
            updated_at = NOW()
        WHERE code = 'ME'
          AND base_unit IS DISTINCT FROM 'kcal/100g'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE food_nutrient_values AS value
        SET value = value.value * 10,
            updated_at = NOW()
        FROM nutrients AS nutrient
        WHERE value.nutrient_uuid = nutrient.uuid
          AND nutrient.code = 'ME'
          AND nutrient.base_unit = 'kcal/100g'
          AND value.value IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE nutrients
        SET base_unit = 'kcal',
            updated_at = NOW()
        WHERE code = 'ME'
        """
    )
