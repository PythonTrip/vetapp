# Nutrition standard providers

`NutritionStandardProvider` is the API boundary between FastAPI and a published
nutrition standard. `StandardRegistry` selects a provider by `(standard_code,
edition)` and exposes one explicitly active edition per standard.

Provider internals are deliberately not shared as a universal rules language.
FEDIAF 2025 owns its records, formula evaluator, context resolver,
applicability rules, references, and assessment implementation under
`fediaf/v2025/`. NRC and AAFCO providers may use different internal models as
long as they implement the common provider contract.

Published provider modules are immutable. A new FEDIAF edition is added as a
new sibling package such as `fediaf/v2026/` and registered explicitly; the
`v2025` package is not rewritten in place.

PostgreSQL remains responsible for patient/clinical data, foods, diet plans,
and stored assessment snapshots. A snapshot freezes provider identity,
checksum, resolved context, and result so reading an old plan never invokes the
current provider.

Alembic revision `0019_archive_guideline_runtime_tables` keeps only
`guideline_standards` and `guideline_editions` in `public`. Pre-provider
normative tables are moved intact to `legacy_guidelines` for lossless rollback;
the application metadata and runtime do not map that archive schema.
