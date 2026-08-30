---
prd_id: 2026-08-29-nutrition-context-split
cycle_id: 2026-08-29-nutrition-context-split
cycle_slug: nutrition-context-split
title: Nutrition Context Split
created: 2026-08-29
filename: docs/prd/2026-08-29_nutrition-context-split_prd.md
project_doc: docs/PROJECT.md
status: draft
scope_type: cycle
source: product-discovery
related_issue_batch: null
---

# PRD: Nutrition Context Split

## 1. Cycle Summary

This cycle removes the application-owned invariant:

```text
FEDIAF nutrient profile
        ↕ strict ownership
MER formula
```

and rebuilds the nutrition workspace around three independent clinical questions:

```text
1. Animal Context
2. Daily Energy
3. Nutrient Standard
```

The product outcome is:

> A veterinary nutritionist can set the animal’s physiological context, see a live and reproducible FEDIAF energy estimate, confirm an appropriate nutrient standard independently, build a ration, and receive an assessment that cannot appear valid after relevant inputs change.

The clinician must not need to understand or operate internal `profile → formula` database ownership.

---

## 2. Why This Cycle Exists

The current implementation has several trust-breaking behaviors:

- an EnergyFormula belongs to exactly one nutrient profile;
- mismatched formula/profile pairs are rejected with 422 even when the combination is clinically valid;
- energy ranges can collapse to the lower bound;
- adult nutrient standards are exposed as `MER95/110` and `MER75/100` clinician-facing profiles;
- changes to body weight and other inputs can leave old kcal/results visible;
- there is no request/result fingerprint for stale assessment protection;
- current weight, target weight, and expected mature weight are not cleanly separated;
- the result screen leads with a large nutrient dump and a prototype coverage percentage rather than deviations and missing evidence.

This cycle corrects the domain model before further nutrition functionality is added.

---

## 3. Product Principles / Non-Negotiable Invariants

### 3.1 Independent clinical objects

These are separate objects:

```text
Animal Context
Energy Scenario
Nutrient Standard
Ration
Assessment
```

An Energy Scenario does **not** own a Nutrient Standard.

Compatibility is validated by:

- species;
- physiological context;
- age/life-stage applicability;
- required inputs;
- method-specific constraints.

### 3.2 Server-side clinical logic

All normative calculations remain server-side.

React may:

- debounce requests;
- render previews;
- mark local state dirty;
- discard late responses.

React must not duplicate the FEDIAF calculation engine.

### 3.3 Suggestions are not confirmation

A suggestion may produce a preview, but never silently becomes confirmed state.

```text
suggested != confirmed
```

### 3.4 `NULL != 0`

Missing nutrient data remain missing.

Unknown data never become zero and never count as meeting a minimum.

### 3.5 Historical snapshots remain historical

Legacy Diet Plan snapshots are rendered as saved.

No automatic remapping or live recomputation occurs merely because a historical plan is opened.

---

## 4. Current Project Context

- Split stack: Next.js UI + one FastAPI process + PostgreSQL.
- Existing features: Patient picker, Food catalog, ration builder, FEDIAF assessment, Diet Plan snapshots.
- Cycle #4 introduced strict `profile + formula` pairing and exact-pair 422 validation.
- Range energy can currently collapse to a single lower-bound MER.
- Current adult imported nutrient rows are concentration profiles:
  - `dog_adult_mer95`
  - `dog_adult_mer110`
  - `cat_adult_mer75`
  - `cat_adult_mer100`
- FEDIAF Table VII-11 is currently absent from JSON/CSV/xlsx.
- Current weight fields do not cleanly represent:
  - current body weight;
  - target clinical body weight;
  - expected mature body weight.
- No dedicated lightweight energy-estimate API.
- No assessment `input_hash`.
- Results UI exposes technical profile/formula dropdowns and leads with coverage percentage.
- Existing Vitamin E unit-safety and legal-maxima clinical exclusion behavior must be preserved.

---

# 5. New Domain Model

```text
Animal Context
     │
     ├──> Energy Scenario ───────> Energy Estimate
     │                              point | range
     │
     └──> Nutrient Standard ─────> Required nutrient intake / density
                                    │
Ration ─────────────────────────────┘
                 │
                 └──> Assessment
```

## 5.1 Energy Scenario

Answers:

> What daily metabolizable energy intake does the selected FEDIAF method estimate for this animal?

Examples:

- adult dog age/activity method;
- dog growth 8 weeks–1 year;
- gestation;
- lactation;
- adult indoor/neutered cat;
- active adult cat;
- kitten `k × MER`.

## 5.2 Nutrient Standard

Answers:

> What nutrient requirements or constraints apply to this animal’s current life stage?

Two calculation bases exist in this cycle:

```text
daily_per_metabolic_bw
published_per_1000_kcal
```

### Adult maintenance

Dogs/cats:

```text
FEDIAF Table VII-11
daily_per_metabolic_bw
```

### Growth / reproduction

Existing published life-stage tables:

```text
published_per_1000_kcal
```

## 5.3 Nutrient constraints

Minimums and upper constraints must not be forced into the old profile/formula ownership.

For adult maintenance:

- minimum daily intake comes from VII-11;
- nutritional maxima / ratio constraints remain separate published FEDIAF constraints where applicable;
- EU legal maxima remain excluded from the clinical ration verdict under the existing Nutrition Trust Reset policy.

A clinician does not select an adult `MER75/100/95/110` profile to obtain maxima.

---

# 6. Independent Energy Scenario and Nutrient Standard

Remove runtime/import ownership:

```text
energy_formula.profile_uuid
formula must belong to profile
exact-pair 422
```

Replace with compatibility checks.

Allowed examples:

```text
adult dog
energy = 125 × BW^0.75
nutrient standard = adult maintenance VII-11
```

```text
dog, 10 weeks
energy = growth 8w–1y
nutrient standard = early growth <14 weeks
```

```text
dog, 9 months
energy = growth 8w–1y
nutrient standard = late growth >=14 weeks
```

Suggestions return independently:

```json
{
  "energy_suggestion": {
    "code": "dog_growth_8w_1y",
    "reason": "dog_age_9_months"
  },
  "nutrient_standard_suggestion": {
    "code": "dog_late_growth",
    "reason": "dog_age_ge_14_weeks"
  }
}
```

Neither object is applied without an explicit clinician action.

---

# 7. Table VII-11 Adult Daily Minima

## 7.1 Data capture

FEDIAF 2025.09 Table VII-11 must be transcribed into the existing versioned guideline JSON:

```text
docs/data/fediaf_2025_veterinary_nutrition_database_ru.json
```

The normal pipeline remains:

```text
FEDIAF PDF
    ↓
versioned JSON guideline SoT
    ↓
validator
    ↓
CLI import
    ↓
publish edition
    ↓
PostgreSQL
```

No runtime PDF parser.

No parallel CSV runtime source.

## 7.2 Adult calculation

Dogs:

```text
metabolic_BW = BW^0.75

required_daily =
VII_11_value × metabolic_BW
```

Cats:

```text
metabolic_BW = BW^0.67

required_daily =
VII_11_value × metabolic_BW
```

Assessment:

```text
actual_daily_from_ration
vs
required_daily
```

`working_energy_target_kcal_day` is **not** part of this adult minimum comparison.

## 7.3 Display-only calculated density

UI may display:

```text
calculated_density =
required_daily
× 1000
/ working_energy_target_kcal_day
```

Label exactly as a derived value, e.g.:

> Расчётная плотность для текущей энергетической цели

Never label it as a published FEDIAF profile.

## 7.4 VII-11 is not reconstructed from MER columns

Do not derive VII-11 from `mer75/100/95/110`.

No heuristic such as:

```text
daily minimum =
dense adult column × MER coefficient
```

is allowed.

Published concentration tables remain separate normative data.

---

# 8. VII-11 Data Acceptance Requirements

The cycle is not complete until Table VII-11 passes source-level validation.

Every imported row must retain:

```text
edition
source_language = en
source_table = VII-11
source_page = 58
species
nutrient / derived-expression code
source_unit
source_value
applicability
footnote/reference when applicable
```

Required validator rules:

- unknown nutrient code -> import failure;
- unknown unit -> import failure;
- duplicate standard row -> import failure;
- absent source page/table -> import failure;
- `NULL` may never become `0`;
- composite nutrients remain derived expressions where the existing canonical model requires it;
- feed-form-dependent rows preserve applicability;
- row-level golden fixtures compare imported values against the official PDF;
- the published edition cannot be marked valid if the VII-11 validation suite fails.

### Vitamin E

VII-11 Vitamin E must be captured using the **published source unit**.

The existing Vitamin E unit-safety behavior remains unchanged:

```text
unknown / unconvertible food Vitamin E
→ insufficient_context
→ never silently compared across mg and IU
```

This cycle does not implement the new Vitamin E compound-form conversion layer.

---

# 9. Reactive Energy Estimate

Add a lightweight server endpoint using the same calculation library as full assessment.

Example product contract:

```text
POST /nutrition/energy-estimate
```

Exact route naming is engineering-owned.

UI debounce:

```text
300–500 ms
```

## Point response

```json
{
  "method_code": "dog_growth_8w_1y",
  "value": {
    "kind": "point",
    "kcal_day": 972.09
  },
  "inputs": {
    "current_body_weight_kg": 15,
    "expected_mature_weight_kg": 16
  },
  "source": {
    "edition": "2025.09",
    "table": "VII-8b",
    "page": 56
  }
}
```

## Range response

```json
{
  "method_code": "cat_adult_indoor_neutered",
  "value": {
    "kind": "range",
    "min_kcal_day": 152.87,
    "max_kcal_day": 220.48
  }
}
```

A range must never silently collapse to one bound.

---

# 10. Working Energy Target

## 10.1 Point estimate

After clinician applies a point Energy Scenario:

```text
working_energy_target_kcal_day = calculated point
working_energy_target_source = calculated_point
```

No second manual re-entry of the same number is required.

Clinician may override it explicitly.

## 10.2 Range estimate

After clinician applies a range Energy Scenario:

```text
working_energy_target_kcal_day = null
```

until the clinician selects or enters a point.

Possible sources:

```text
clinician_selected_from_range
clinician_override
```

No midpoint, lower bound, or upper bound is silently chosen.

## 10.3 Ration editing

Ration editing is **not blocked** by an unset working target.

The clinician may add/remove Foods and edit grams at any time.

What waits for a working target:

- target-vs-ration kcal comparison;
- full assessment when the selected scenario requires a working target;
- calculated density displays requiring kcal.

---

# 11. Weight Semantics

Use three distinct concepts:

```text
current_body_weight_kg
target_body_weight_kg
expected_mature_weight_kg
```

## 11.1 Current body weight

The animal’s actual current weight.

This is the default FEDIAF formula basis.

## 11.2 Expected mature weight

Used for dog growth formulas and growth/size applicability.

Never label it as “ideal weight”.

## 11.3 Target body weight

A clinician-entered therapeutic/management target.

Session + Diet Plan snapshot only in this cycle.

Patient schema is unchanged.

## 11.4 Method-specific allowed weight bases

Do **not** add one global `current vs target` switch that modifies every energy formula.

Each Energy Scenario defines allowed weight bases.

Examples:

```text
adult maintenance:
  current
  target_override (when clinically chosen)

dog growth 8w–1y:
  current only
  + expected_mature as separate required input

gestation/lactation:
  formula-defined basis
```

Advanced UI displays a BW-basis override only where the selected Energy Scenario permits it.

---

# 12. Size Class

Size class becomes derived server context.

Default:

```text
expected_mature_weight_kg
→ server size-class derivation
→ calcium/growth applicability
```

It leaves the primary UI.

Advanced:

```text
Calculated size class: >15 kg
[Override]
```

Any override is session/snapshot state and must be traceable in assessment output.

---

# 13. Kitten and Other `k × MER` Methods

A `k × MER` formula must not fabricate a base MER.

Model explicitly:

```text
Base MER Estimate
  point | range

Multiplier
  point | range

Combined Energy Estimate
  point | range

Working Energy Target
  point chosen/confirmed by clinician when estimate is a range
```

Example:

```text
base MER coefficient = 52–75
multiplier = 2.0–2.5
```

The preview may propagate the ranges mathematically rather than selecting `52`, `75`, or a midpoint silently.

If the selected workflow requires a clinician-confirmed base-MER point before final calculation, the UI must make that an explicit step.

The product must never use the lower bound as an invisible base MER.

---

# 14. Assessment Preconditions vs `indeterminate`

This distinction is normative for the API.

## 14.1 Invalid / incomplete request → no assessment

Use gate / 422 for invalid clinical request state.

Examples:

```text
dog patient + cat-only energy method
growth formula missing required expected mature weight
unconfirmed nutrient standard
range energy method with no working target when full assessment requires it
invalid physiological context
```

In these cases:

```text
no clinical assessment verdict exists
```

## 14.2 Valid request + incomplete evidence → HTTP 200 + indeterminate

Examples:

```text
required Food nutrient value missing
feed form unknown for form-dependent target
Vitamin E cannot be converted safely
```

In these cases:

```text
assessment is valid
overall = indeterminate
```

`indeterminate` is never used to hide an invalid request contract.

---

# 15. Stale-Result Protection

Stale safety has two layers.

## 15.1 Immediate UI dirty state

Any relevant local edit immediately marks the displayed assessment stale:

```text
assessmentDirty = true
```

The UI must immediately:

- remove adequate/inadequate success chrome;
- show `Расчёт устарел`;
- stop presenting old nutrient statuses as current.

This does not wait for a server round-trip.

## 15.2 Request sequencing

Every asynchronous calculation request uses a monotonically increasing request sequence/token.

If:

```text
request 17 sent
request 18 sent
response 17 arrives later
```

response 17 is discarded.

An older response must never overwrite a newer calculation.

## 15.3 Server `input_hash`

The server returns/stores an `input_hash` for traceability and snapshot reproducibility.

Hash inputs include the normalized assessment inputs:

- relevant animal fields;
- confirmed Energy Scenario;
- confirmed Nutrient Standard;
- working target;
- weight-basis override;
- ration lines + grams;
- feed context;
- guideline edition.

The client does not need to reproduce the server hash to provide immediate stale safety.

If frontend/backend hash comparison is later added, canonical JSON rules must be separately specified.

---

# 16. Input Invalidation Matrix

These invalidate the **full assessment**:

```text
current body weight
expected mature weight
target weight when used as formula basis
age
activity when used by chosen method/context
neuter status when used by chosen method/context
gestation
lactation week
litter size
confirmed energy method
confirmed nutrient standard
working energy target
weight-basis override
size-class override
ration lines
ration grams
feed form/context
guideline edition
```

### RER factor

`RER × factor` is a **secondary cross-check** only.

Changing the factor:

- recalculates the RER cross-check live;
- does **not** invalidate the FEDIAF ration assessment unless a future feature explicitly uses that factor as an assessment input.

---

# 18. Clinician Workspace

Primary workflow:

```text
Animal Context
↓
Energy
↓
Ration
↓
Assessment
```

## 18.1 Animal Context

Conditionally show fields.

Examples:

- expected mature weight only when relevant to growth;
- pregnancy controls only when applicable;
- lactation week / litter size only during lactation;
- do not show permanently empty reproductive controls.

## 18.2 Energy

Primary card:

```text
Энергия

972 ккал/сут
FEDIAF: щенок 8 недель–1 год

Основание:
15 кг сейчас
16 кг ожидаемый взрослый вес

[Изменить метод]
```

For range:

```text
153–220 ккал/сут
Рабочая цель: [     ]
```

Unapplied suggestion may power live preview:

```text
Предложено
```

but is not confirmed.

## 18.3 Advanced “Изменить метод”

Contains:

- manual Energy Scenario;
- manual Nutrient Standard;
- size-class override;
- allowed BW-basis override;
- source/method detail.

It is an escape hatch, not the default happy path.

## 18.4 RER

Display under:

> Дополнительная сверка

It does not have equal hierarchy with primary FEDIAF energy.

## 18.5 Ration

Show:

```text
Food
grams
kcal
```

Summary:

```text
Рабочая цель: 972 kcal
Рацион: 970 kcal
Разница: -2 kcal
```

If no working target:

```text
Рацион: 970 kcal
Рабочая цель ещё не выбрана
```

Ration remains editable.

---

# 19. Assessment Results UX

Do not lead with a 40+ nutrient table.

## Summary first

Example:

```text
Энергия
970 / 972 kcal

Нутриенты
12 соответствуют
3 ниже минимума
16 невозможно оценить

Итог
Недостаточно данных для полного вывода
```

## Default result filters

```text
[Отклонения]
[Все нутриенты]
[Нет данных]
[Источники]
```

Default:

```text
deviations + missing/insufficient evidence
```

## Coverage copy

Do not lead with:

```text
Неполное покрытие каталога: 36.4%
```

Use:

```text
Не хватает данных по 28 из 44 показателей.
Из-за отсутствующих данных общий вывод не сформирован.
```

Coverage percentage may remain secondary/diagnostic.

---

# 20. Adult Assessment Semantics

For adult maintenance:

```text
required_daily =
VII-11 × metabolic_BW

actual_daily =
sum of ration nutrient intake from entered grams
```

Compare directly.

Example adult cat:

```text
required protein =
6.25 × BW^0.67 g/day
```

If clinician chooses 190 kcal/day, the UI may derive:

```text
required_daily × 1000 / 190
```

as an informational density.

That density is not an independently published FEDIAF profile.

Adult `MER75/100/95/110` density rows are not clinician-facing standard choices.

---

# 21. Growth / Reproduction Assessment Semantics

Growth/reproduction nutrient standards remain based on the published life-stage concentration tables.

```text
required_daily =
target_per_1000_kcal
× working_energy_target
/ 1000
```

Energy Scenario and life-stage Nutrient Standard remain independently confirmed.

A single growth Energy Scenario can validly work with early- or late-growth nutrient standards depending on Animal Context.

---

# 22. Existing Adult Density Rows

Existing imported rows:

```text
dog_adult_mer95
dog_adult_mer110
cat_adult_mer75
cat_adult_mer100
```

may remain in the edition as archival published concentration standards.

They must not:

- appear as clinician-facing adult Nutrient Standard choices;
- be suggestion targets;
- determine energy-formula compatibility;
- cause exact-pair 422;
- be used to reconstruct VII-11.

A future reference/compliance surface is out of scope.

---

# 23. Legacy Diet Plans

Opening a legacy plan:

```text
render stored snapshot
do not recompute
do not remap old profile/formula pair
```

Display a clear historical marker:

> Расчёт выполнен предыдущей версией nutrition engine.

If clinician selects:

> Пересчитать по текущей версии

then create a new current-model calculation state:

- independent Energy Scenario;
- Nutrient Standard;
- current working target;
- current engine version;
- current guideline edition;
- new input hash.

No magic migration from an old `mer75 + formula` pair is performed.

---

# 24. API/Product Contracts

## 24.1 Energy estimate

Returns:

```text
method
point/range
inputs used
source
warnings
```

## 24.2 Full assessment

Accepts:

```text
animal context
confirmed energy scenario
confirmed nutrient standard
working energy target when required
weight basis / overrides
ration
feed context
```

Returns:

```text
energy result
working target
nutrient standard metadata
ration totals
results
overall
warnings
source refs
engine version
guideline edition
input_hash
```

## 24.3 Suggestions

Return two independent suggestions.

No owning `profile_code` is attached to an energy formula as a pairing key.

---

# 25. Product Architecture Impact

Same app shape:

```text
Next.js
FastAPI
PostgreSQL
```

No second process.

No client-side clinical formula engine.

## EnergyFormula / EnergyScenario

Minimum semantics:

```text
uuid
edition_uuid
code
species
physiological_context
ast_json
result_kind
required_fields
valid_age/context applicability
allowed_weight_bases
source_page
source_table
```

Remove required ownership:

```text
profile_uuid NOT NULL
```

## NutrientStandard

Minimum semantics:

```text
uuid
edition_uuid
code
species
life_stage
calculation_basis
source_page
source_table
```

Calculation basis:

```text
published_per_1000_kcal
daily_per_metabolic_bw
```

Exact DB naming/normalization is engineering-owned as long as runtime semantics match this PRD.

---

# 26. Data / Integration Constraints

- PostgreSQL remains existing deployment DB.
- FEDIAF external publication: 2025.09.
- JSON guideline SoT + CLI import/publish remain the only runtime data path.
- VII-11 is added to that JSON in this cycle.
- Existing growth/reproduction tables stay in guideline data.
- Instance password remains access boundary.
- Russian UI.
- No third-party services added.

---

# 27. Out of Scope

- New Vitamin E compound-form conversion implementation.
- Changes to current legal-maxima clinical policy.
- Writing nutrition session overrides to Patient.
- Writing `target_body_weight_kg` to Patient.
- Disease-specific therapeutic nutrient standards.
- Clinician UI for archival adult 95/110 or 75/100 density comparison.
- Complementary-only assessment branch.
- NRC / AAFCO runtime standards.
- Users / roles.
- Encounter-stored nutrition calculations.
- English UI.
- S3.
- Docker / Vercel / Neon migration.
- Runtime reading of PDF/CSV/xlsx.
- Schedule/gallery/communications/template changes except existing nutrition deep-links.
- Food `species_compatibility`, species-filtered catalog/ration search, and ration-level species-mismatch confirmation.

---

# 28. Golden / Regression Tests

At minimum:

## Energy

### Dog growth

```text
current BW = 15 kg
expected mature BW = 16 kg
growth 8w–1y
→ 972.09 kcal/day
```

Change mature weight:

```text
expected mature BW = 18 kg
→ 1079.27 kcal/day
```

UI result must change.

### Cat indoor/neutered

```text
BW = 5 kg
52–75 × BW^0.67
→ 152.87–220.48 kcal/day
```

Never return only `152.87`.

## Independent compatibility

Allowed:

```text
adult dog
energy = 125 × BW^0.75
adult nutrient standard = VII-11
```

Allowed:

```text
dog 10 weeks
growth 8w–1y energy
early growth standard
```

Allowed:

```text
dog 9 months
growth 8w–1y energy
late growth standard
```

## Adult VII-11

Golden fixtures must validate imported rows against the official source.

Adult minimum comparison must use:

```text
actual daily intake
vs
VII-11 × metabolic BW
```

not a reconstructed MER75/95 density.

## Stale behavior

1. Run assessment.
2. Change a relevant input.
3. UI immediately marks assessment stale.
4. Older network response cannot restore the old calculation.

## Legacy

Opening old Diet Plan:

```text
no automatic remap
no automatic recompute
```

---

# 29. Definition of Done

The cycle is complete only when all are true:

- [ ] Energy Scenario no longer owns exactly one Nutrient Standard.
- [ ] Exact profile/formula mismatch is no longer a 422 condition.
- [ ] 422/gates are limited to invalid request/context states.
- [ ] Valid assessments with incomplete evidence return `overall = indeterminate`.
- [ ] Suggestions for energy and nutrient standard are independent and require Apply.
- [ ] Table VII-11 is present in the versioned guideline JSON and published through the existing CLI flow.
- [ ] VII-11 passes row-level source/golden validation.
- [ ] Adult dog/cat minimum verdict uses VII-11 daily values.
- [ ] Adult MER95/110 and MER75/100 are absent from clinician-facing standard selection.
- [ ] Point Energy Scenario Apply sets working target automatically.
- [ ] Range Energy Scenario never silently selects a point.
- [ ] Kitten / `k × MER` methods never silently select a base-MER bound.
- [ ] Ration editing is available even if working target is not yet selected.
- [ ] Current, target, and expected mature weight are distinct fields.
- [ ] Growth formulas cannot substitute target BW for actual current BW.
- [ ] Size class is derived server-side and removed from the primary form.
- [ ] Relevant input edits immediately mark the visible assessment stale.
- [ ] Late responses cannot restore an older calculation.
- [ ] Server assessment response/snapshot includes `input_hash`.
- [ ] RER factor is secondary and does not incorrectly invalidate the FEDIAF assessment.
- [ ] Results default to deviations + missing data rather than a full nutrient dump.
- [ ] Missing evidence is shown as concrete `N из M`, not primarily as a coverage percentage.
- [ ] Legacy Diet Plans render without automatic remapping/recompute.
- [ ] VII-11 Vitamin E preserves existing unit-safety and cannot silently compare mg vs IU.
- [ ] EU legal maxima remain excluded from the clinical ration verdict.
- [ ] All normative calculations remain server-side.
- [ ] `docs/Nutrient.md` is updated so strict formula→profile ownership is no longer documented as current truth.

---

# 30. Suggested Implementation Breakdown

This remains **one roadmap cycle** with multiple issues.

## Issue 1 — Guideline model decoupling

- remove runtime profile ownership;
- compatibility validation;
- independent suggestions;
- migration/model updates.

## Issue 2 — Table VII-11 data capture

- transcribe source rows;
- source metadata;
- validator;
- golden tests;
- import/publish.

## Issue 3 — Energy estimate + range semantics

- shared server calculation library;
- point/range result;
- working target;
- kitten/base-MER behavior.

## Issue 4 — Weight and size context

- split weight fields;
- allowed weight bases;
- server size class;
- advanced override.

## Issue 5 — Assessment contract + stale safety

- 422 vs indeterminate semantics;
- dirty state;
- request sequencing;
- input hash;
- snapshot updates.

## Issue 6 — Clinician workspace UI

- Animal → Energy → Ration → Assessment;
- conditional context fields;
- RER secondary;
- advanced method controls;
- result summary/tabs.

## Issue 7 — Legacy + documentation + regression closeout

- legacy snapshot rendering;
- current-version recalc path;
- docs/Nutrient.md;
- full regression suite;
- final PRD DoD verification.

---

# 31. Remaining Engineering Choices

The following do **not** block product definition:

- exact HTTP route names;
- exact enum string names;
- whether `GuidelineProfile` is renamed in place or replaced;
- exact internal canonical JSON/hash implementation, provided stale safety and snapshot traceability meet this PRD.

They must not change the product invariants defined above.
