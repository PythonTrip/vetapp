"""Add indexes used by the food matrix filters and value lookup.

Revision ID: 0015_food_matrix_indexes
Revises: 0014_energy_formula_range_semantics
Create Date: 2026-08-30
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0015_food_matrix_indexes"
down_revision: Union[str, Sequence[str], None] = "0014_energy_formula_range_semantics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_foods_category_subcategory",
        "foods",
        ["category", "subcategory"],
    )
    op.create_index(
        "ix_food_nutrient_values_food_basis_nutrient_updated",
        "food_nutrient_values",
        ["food_uuid", "basis", "nutrient_uuid", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_food_nutrient_values_food_basis_nutrient_updated",
        table_name="food_nutrient_values",
    )
    op.drop_index("ix_foods_category_subcategory", table_name="foods")
