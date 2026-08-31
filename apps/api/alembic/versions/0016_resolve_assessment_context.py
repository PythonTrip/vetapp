"""Resolve assessment context server-side and remove legacy confirmation keys.

Revision ID: 0016_resolve_assessment_context
Revises: 0015_food_matrix_indexes
Create Date: 2026-08-31
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0016_resolve_assessment_context"
down_revision: Union[str, Sequence[str], None] = "0015_food_matrix_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE diet_plans
        SET assessment_snapshot_json =
            jsonb_set(
                jsonb_set(
                    jsonb_set(
                        assessment_snapshot_json,
                        '{request}',
                        (
                            assessment_snapshot_json->'request'
                            - 'confirmed_profile_code'
                            - 'confirmed_energy_formula_code'
                            - 'confirmed_size_class_code'
                            - 'size_class_override_code'
                            - 'weight_basis'
                            - 'working_energy_target_kcal_day'
                            - 'working_energy_target_source'
                        ) || jsonb_build_object(
                            'energy_adjustment_percent',
                            CASE
                                WHEN (assessment_snapshot_json#>>'{assessment,energy,reference_energy_kcal}')::numeric > 0
                                THEN round(
                                    (assessment_snapshot_json#>>'{request,working_energy_target_kcal_day}')::numeric
                                    / (assessment_snapshot_json#>>'{assessment,energy,reference_energy_kcal}')::numeric
                                    * 100,
                                    6
                                )
                                ELSE 100
                            END
                        ),
                        true
                    ),
                    '{nutrient_profile_code}',
                    coalesce(
                        assessment_snapshot_json#>'{request,confirmed_profile_code}',
                        assessment_snapshot_json#>'{assessment,context,profile_code}',
                        'null'::jsonb
                    ),
                    true
                ),
                '{energy_formula_code}',
                coalesce(
                    assessment_snapshot_json#>'{request,confirmed_energy_formula_code}',
                    assessment_snapshot_json#>'{assessment,context,energy_formula_code}',
                    'null'::jsonb
                ),
                true
            )
        WHERE jsonb_typeof(assessment_snapshot_json) = 'object';

        UPDATE diet_plans
        SET assessment_snapshot_json = jsonb_set(
            jsonb_set(
                assessment_snapshot_json,
                '{assessment,context}',
                (
                    assessment_snapshot_json#>'{assessment,context}'
                    - 'profile_code'
                    - 'size_class_derived_code'
                    - 'size_class_override_code'
                    - 'working_energy_target_kcal_day'
                    - 'working_energy_target_source'
                ) || jsonb_build_object(
                    'nutrient_profile_code', assessment_snapshot_json->'nutrient_profile_code'
                ),
                true
            ),
            '{assessment,energy}',
            (
                assessment_snapshot_json#>'{assessment,energy}'
                - 'fediaf_mer_kcal_day'
                - 'fediaf_mer_min_kcal_day'
                - 'fediaf_mer_max_kcal_day'
                - 'working_energy_target_kcal_day'
                - 'working_energy_target_source'
            ) || jsonb_build_object(
                'energy_formula_code', assessment_snapshot_json->'energy_formula_code',
                'reference_energy_kcal', coalesce(
                    assessment_snapshot_json#>'{assessment,energy,fediaf_mer_kcal_day}',
                    to_jsonb(
                        (
                            (assessment_snapshot_json#>>'{assessment,energy,fediaf_mer_min_kcal_day}')::numeric
                            + (assessment_snapshot_json#>>'{assessment,energy,fediaf_mer_max_kcal_day}')::numeric
                        ) / 2
                    ),
                    'null'::jsonb
                ),
                'reference_energy_min_kcal', coalesce(
                    assessment_snapshot_json#>'{assessment,energy,fediaf_mer_min_kcal_day}',
                    'null'::jsonb
                ),
                'reference_energy_max_kcal', coalesce(
                    assessment_snapshot_json#>'{assessment,energy,fediaf_mer_max_kcal_day}',
                    'null'::jsonb
                ),
                'range_working_point_rule', CASE
                    WHEN assessment_snapshot_json#>'{assessment,energy,fediaf_mer_min_kcal_day}' IS NOT NULL
                    THEN '"midpoint"'::jsonb
                    ELSE 'null'::jsonb
                END,
                'energy_adjustment_percent', assessment_snapshot_json#>'{request,energy_adjustment_percent}',
                'working_energy_kcal', coalesce(
                    assessment_snapshot_json#>'{assessment,energy,working_energy_target_kcal_day}',
                    assessment_snapshot_json#>'{assessment,energy,fediaf_mer_kcal_day}',
                    to_jsonb(
                        (
                            (assessment_snapshot_json#>>'{assessment,energy,fediaf_mer_min_kcal_day}')::numeric
                            + (assessment_snapshot_json#>>'{assessment,energy,fediaf_mer_max_kcal_day}')::numeric
                        ) / 2
                    ),
                    'null'::jsonb
                )
            ),
            true
        )
        WHERE jsonb_typeof(assessment_snapshot_json) = 'object';
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE diet_plans
        SET assessment_snapshot_json = jsonb_set(
            jsonb_set(
                assessment_snapshot_json - 'nutrient_profile_code' - 'energy_formula_code',
                '{request}',
                (assessment_snapshot_json->'request') || jsonb_build_object(
                    'confirmed_profile_code', assessment_snapshot_json->'nutrient_profile_code',
                    'confirmed_energy_formula_code', assessment_snapshot_json->'energy_formula_code',
                    'weight_basis', assessment_snapshot_json#>'{assessment,context,weight_basis}',
                    'size_class_override_code', 'null'::jsonb,
                    'working_energy_target_kcal_day', assessment_snapshot_json#>'{assessment,energy,working_energy_kcal}',
                    'working_energy_target_source', '"clinician_override"'::jsonb
                ) - 'energy_adjustment_percent',
                true
            ),
            '{assessment,context}',
            (assessment_snapshot_json#>'{assessment,context}') || jsonb_build_object(
                'profile_code', assessment_snapshot_json->'nutrient_profile_code'
            ) - 'nutrient_profile_code',
            true
        )
        WHERE jsonb_typeof(assessment_snapshot_json) = 'object';
        """
    )
