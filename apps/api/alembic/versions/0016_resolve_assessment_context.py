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


def _execute(sql: str) -> None:
    op.get_bind().exec_driver_sql(sql)


def _jsonb_object(path_sql: str) -> str:
    return (
        f"CASE WHEN jsonb_typeof({path_sql}) = 'object' THEN {path_sql} ELSE '{{}}'::jsonb END"
    )


def upgrade() -> None:
    snapshot = "assessment_snapshot_json"
    request = _jsonb_object(f"({snapshot} -> 'request'::text)")
    context = _jsonb_object(f"({snapshot} #> ARRAY['assessment','context']::text[])")
    energy = _jsonb_object(f"({snapshot} #> ARRAY['assessment','energy']::text[])")
    _execute(
        f"""
        UPDATE diet_plans
        SET assessment_snapshot_json =
            jsonb_set(
                jsonb_set(
                    jsonb_set(
                        {snapshot},
                        ARRAY['request']::text[],
                        (
                            {request}
                            - ARRAY[
                                'confirmed_profile_code',
                                'confirmed_energy_formula_code',
                                'confirmed_size_class_code',
                                'size_class_override_code',
                                'weight_basis',
                                'working_energy_target_kcal_day',
                                'working_energy_target_source'
                            ]::text[]
                        ) || jsonb_build_object(
                            'energy_adjustment_percent',
                            CASE
                                WHEN NULLIF(
                                    {snapshot} #>> ARRAY['assessment','energy','reference_energy_kcal']::text[],
                                    ''
                                )::numeric > 0
                                THEN round(
                                    NULLIF(
                                        {snapshot} #>> ARRAY['request','working_energy_target_kcal_day']::text[],
                                        ''
                                    )::numeric
                                    / NULLIF(
                                        {snapshot} #>> ARRAY['assessment','energy','reference_energy_kcal']::text[],
                                        ''
                                    )::numeric
                                    * 100,
                                    6
                                )
                                ELSE 100
                            END
                        ),
                        true
                    ),
                    ARRAY['nutrient_profile_code']::text[],
                    coalesce(
                        {snapshot} #> ARRAY['request','confirmed_profile_code']::text[],
                        {snapshot} #> ARRAY['assessment','context','profile_code']::text[],
                        'null'::jsonb
                    ),
                    true
                ),
                ARRAY['energy_formula_code']::text[],
                coalesce(
                    {snapshot} #> ARRAY['request','confirmed_energy_formula_code']::text[],
                    {snapshot} #> ARRAY['assessment','context','energy_formula_code']::text[],
                    'null'::jsonb
                ),
                true
            )
        WHERE jsonb_typeof({snapshot}) = 'object'
        """
    )
    _execute(
        f"""
        UPDATE diet_plans
        SET assessment_snapshot_json = jsonb_set(
            jsonb_set(
                {snapshot},
                ARRAY['assessment','context']::text[],
                (
                    {context}
                    - ARRAY[
                        'profile_code',
                        'size_class_derived_code',
                        'size_class_override_code',
                        'working_energy_target_kcal_day',
                        'working_energy_target_source'
                    ]::text[]
                ) || jsonb_build_object(
                    'nutrient_profile_code', {snapshot} -> 'nutrient_profile_code'::text
                ),
                true
            ),
            ARRAY['assessment','energy']::text[],
            (
                {energy}
                - ARRAY[
                    'fediaf_mer_kcal_day',
                    'fediaf_mer_min_kcal_day',
                    'fediaf_mer_max_kcal_day',
                    'working_energy_target_kcal_day',
                    'working_energy_target_source'
                ]::text[]
            ) || jsonb_build_object(
                'energy_formula_code', {snapshot} -> 'energy_formula_code'::text,
                'reference_energy_kcal', coalesce(
                    {snapshot} #> ARRAY['assessment','energy','fediaf_mer_kcal_day']::text[],
                    to_jsonb(
                        (
                            NULLIF(
                                {snapshot} #>> ARRAY['assessment','energy','fediaf_mer_min_kcal_day']::text[],
                                ''
                            )::numeric
                            + NULLIF(
                                {snapshot} #>> ARRAY['assessment','energy','fediaf_mer_max_kcal_day']::text[],
                                ''
                            )::numeric
                        ) / 2
                    ),
                    'null'::jsonb
                ),
                'reference_energy_min_kcal', coalesce(
                    {snapshot} #> ARRAY['assessment','energy','fediaf_mer_min_kcal_day']::text[],
                    'null'::jsonb
                ),
                'reference_energy_max_kcal', coalesce(
                    {snapshot} #> ARRAY['assessment','energy','fediaf_mer_max_kcal_day']::text[],
                    'null'::jsonb
                ),
                'range_working_point_rule', CASE
                    WHEN {snapshot} #> ARRAY['assessment','energy','fediaf_mer_min_kcal_day']::text[] IS NOT NULL
                    THEN to_jsonb('midpoint'::text)
                    ELSE 'null'::jsonb
                END,
                'energy_adjustment_percent', {snapshot} #> ARRAY['request','energy_adjustment_percent']::text[],
                'working_energy_kcal', coalesce(
                    {snapshot} #> ARRAY['assessment','energy','working_energy_target_kcal_day']::text[],
                    {snapshot} #> ARRAY['assessment','energy','fediaf_mer_kcal_day']::text[],
                    to_jsonb(
                        (
                            NULLIF(
                                {snapshot} #>> ARRAY['assessment','energy','fediaf_mer_min_kcal_day']::text[],
                                ''
                            )::numeric
                            + NULLIF(
                                {snapshot} #>> ARRAY['assessment','energy','fediaf_mer_max_kcal_day']::text[],
                                ''
                            )::numeric
                        ) / 2
                    ),
                    'null'::jsonb
                )
            ),
            true
        )
        WHERE jsonb_typeof({snapshot}) = 'object'
        """
    )


def downgrade() -> None:
    snapshot = "assessment_snapshot_json"
    request = _jsonb_object(f"({snapshot} -> 'request'::text)")
    context = _jsonb_object(f"({snapshot} #> ARRAY['assessment','context']::text[])")
    _execute(
        f"""
        UPDATE diet_plans
        SET assessment_snapshot_json = jsonb_set(
            jsonb_set(
                {snapshot}
                    - ARRAY['nutrient_profile_code','energy_formula_code']::text[],
                ARRAY['request']::text[],
                (
                    {request} || jsonb_build_object(
                        'confirmed_profile_code', {snapshot} -> 'nutrient_profile_code'::text,
                        'confirmed_energy_formula_code', {snapshot} -> 'energy_formula_code'::text,
                        'weight_basis', {snapshot} #> ARRAY['assessment','context','weight_basis']::text[],
                        'size_class_override_code', 'null'::jsonb,
                        'working_energy_target_kcal_day', {snapshot} #> ARRAY['assessment','energy','working_energy_kcal']::text[],
                        'working_energy_target_source', to_jsonb('clinician_override'::text)
                    )
                ) - ARRAY['energy_adjustment_percent']::text[],
                true
            ),
            ARRAY['assessment','context']::text[],
            (
                {context} || jsonb_build_object(
                    'profile_code', {snapshot} -> 'nutrient_profile_code'::text
                )
            ) - ARRAY['nutrient_profile_code']::text[],
            true
        )
        WHERE jsonb_typeof({snapshot}) = 'object'
        """
    )
