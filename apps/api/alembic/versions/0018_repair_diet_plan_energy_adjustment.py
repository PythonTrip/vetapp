"""Repair nullable legacy Diet Plan energy adjustment values.

Revision ID: 0018_repair_diet_plan_energy_adjustment
Revises: 0017_me_kcal_per_100g
Create Date: 2026-08-31
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0018_repair_diet_plan_energy_adjustment"
down_revision: Union[str, Sequence[str], None] = "0017_me_kcal_per_100g"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE diet_plans
        SET assessment_snapshot_json = jsonb_set(
            jsonb_set(
                assessment_snapshot_json,
                ARRAY['request','energy_adjustment_percent']::text[],
                coalesce(
                    nullif(
                        assessment_snapshot_json
                            #> ARRAY['request','energy_adjustment_percent']::text[],
                        'null'::jsonb
                    ),
                    '100'::jsonb
                ),
                true
            ),
            ARRAY['assessment','energy','energy_adjustment_percent']::text[],
            coalesce(
                nullif(
                    assessment_snapshot_json
                        #> ARRAY['assessment','energy','energy_adjustment_percent']::text[],
                    'null'::jsonb
                ),
                '100'::jsonb
            ),
            true
        )
        WHERE jsonb_typeof(assessment_snapshot_json) = 'object'
          AND jsonb_typeof(assessment_snapshot_json -> 'request') = 'object'
          AND jsonb_typeof(
              assessment_snapshot_json #> ARRAY['assessment','energy']::text[]
          ) = 'object'
          AND (
              assessment_snapshot_json
                  #> ARRAY['request','energy_adjustment_percent']::text[] IS NULL
              OR assessment_snapshot_json
                  #> ARRAY['request','energy_adjustment_percent']::text[] = 'null'::jsonb
              OR assessment_snapshot_json
                  #> ARRAY['assessment','energy','energy_adjustment_percent']::text[] IS NULL
              OR assessment_snapshot_json
                  #> ARRAY['assessment','energy','energy_adjustment_percent']::text[] = 'null'::jsonb
          )
        """
    )


def downgrade() -> None:
    # The original null/missing distinction cannot be reconstructed safely.
    pass
