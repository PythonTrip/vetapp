---
title: Nutrient
module: nutrition
updated: 2026-08-30
scope: nutrition-nutrient-inventory
related: docs/PROJECT.md
---

# Nutrient

Reference note for the VetDietDerm Nutrition (dietetics) module: purpose, data sources, and data categories on the split stack.

## 1. Module overview

The Nutrition workspace (`/nutrition`) is a clinician-facing dietetics assistant for healthy dogs and cats. It helps a veterinary nutritionist, in one sitting:

1. Select a Patient (search by animal or owner) or keep a manual profile.
2. Confirm a Nutrient Standard and an Energy Scenario independently (suggestions are never silently applied).
3. Estimate daily energy as a point or an explicit range; confirm a working kcal target when the method returns a range (RER × factor remains a secondary cross-check).
4. Build a ration from the Food catalog in grams.
5. Compare adult daily intake to Table VII-11 minima per metabolic body weight, or growth/reproduction intake to the applicable published per-1000-kcal standard.
6. Save a Diet Plan with one assessment snapshot (edition, independent confirmed context, engine identity, input hash, ration, results).

Workspace tabs: **Рацион и анализ** (top clinical context, compact energy strip, ration table, summary-first results) → **Недавние планы** → **Каталог Foods**.

Clinical posture: outputs are informational recommendations for complete/complementary commercial pet food for healthy animals—not an individual prescription. Disease-specific / therapeutic nutrient targets are outside FEDIAF scope and are not a product mode. After confirm, dog/cat rations always receive the healthy-animal comparison.

## 2. Data sources

| Role | Source | Runtime use |
| --- | --- | --- |
| Operational source of truth | PostgreSQL (`nutrients`, `foods`, `food_nutrient_values`, guideline tables, `diet_plans`) | Catalog, assessment, saved plans |
| Guidelines import artifact | `docs/data/fediaf_2025_veterinary_nutrition_database_ru.json` (+ schema) | Operator CLI only → versioned guideline rows; never opened by FastAPI request path or Next.js |
| External publication | [FEDIAF Nutritional Guidelines for Complete and Complementary Pet Food for Cats and Dogs](https://europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf) (edition from `database_meta`, currently `2025.09`) | Cited in `GET /guidelines/active` and Diet Plan snapshot |
| Product catalog import | `docs/data/products_normalized.json` | Operator CLI `vetdietderm_api.catalog.import_products`; clinician can also create/edit Food in the UI |
| Patient context | `Patient` (+ `Client`) and/or manual profile in the workspace | Prefill via Patient picker or `?patientId=`; session fields stay editable and are not written back |
| Saved assessments | `DietPlan.assessment_snapshot_json` | Persistence; reopen shows the stored snapshot, not a live recompute |
| Archival only (not runtime SoT) | `docs/data/fediaf_2025_*.csv`, `docs/data/fediaf_2025_veterinary_nutrition_ru.xlsx` | Historical conversion artifacts |

Pipeline: JSON snapshot → `uv run --project apps/api python -m vetdietderm_api.guidelines.import_fediaf` → validate → CLI publish. The running engine (`nutrition-engine/1.1.0`) loads only the **published** FEDIAF edition from PostgreSQL. NRC 2006, CSV-based FEDIAF generation, and TypeScript `fediaf-data.ts` are not in runtime.

Current nutrient standards have two independent calculation bases: adult maintenance uses Table VII-11 `daily_per_metabolic_bw`; growth and reproduction use `published_per_1000_kcal`. Null / not-established values mean “not set in the source table,” not zero.

## 3. Data categories

### 3.1 Canonical nutrients (`nutrients`)

Shared dictionary for catalog and guidelines. Seeded in Alembic `0003_food_catalog` (**51 atomic codes**). `code` is the business identifier. Categories:

| Category | Codes | Base units |
| --- | --- | --- |
| `main` | `ME`, `CP`, `CFa`, `CFi`, `CAs`, `CH`, `MO`, `DM` | `kcal` (`ME`); `g` (rest) |
| `mineral` | `Ca`, `P`, `Mg`, `Na`, `K`, `Cl`, `Fe`, `Cu`, `Zn`, `Mn`, `Se`, `J` | `mg` except `Se`, `J` (`mcg`) |
| `vitamin` | `A`, `D`, `E`, `B1`, `B2`, `B3`, `B4`, `B5`, `B6`, `B7`, `B9`, `B12`, `C` | `IU` (`A`, `D`); `mg` / `mcg` (rest). Catalog includes **vitamin C**; FEDIAF guidelines do not use `C` as a min target here |
| `amino_acid` | `His`, `Phe`, `Tau`, `Thr`, `Trp`, `Tyr`, `Val`, `Met`, `Ile`, `Lys`, `Arg`, `Leu`, `Cys` | `g` |
| `fatty_acid` | `LA`, `ALA`, `AA`, `EPA`, `DHA` | `g` |

Ratio keys (`ME/DM`, `CP/ME`, `Ca/P`, `ω6/ω3`, …) are **not** `nutrients` rows.

Groups used by derived ω6/ω3:

- `OMEGA_3` → `ALA`, `EPA`, `DHA`
- `OMEGA_6` → `LA`, `AA`

### 3.2 FEDIAF nutrients (`catalogs.nutrients` in the JSON snapshot)

The JSON catalog uses the same five categories and the same canonical `code` values. It lists **45 unique atomic nutrients** (no `ME` / `CFi` / `CAs` / `CH` / `MO` / `DM` / `C`; includes `K1` as a guideline vitamin). No FEDIAF-to-app alias mapping is required at assessment time: profile targets reference canonical `nutrients.uuid` or a derived expression.

Repeated contextual targets use the same code plus an `applicability_rule` (for example wet vs dry selenium both use `Se`, wet vs dry taurine both use `Tau`).

Vitamin E: FEDIAF source tables use IU; the catalog canonical unit is `mg`. Import records that unit mismatch; it is not silently converted in the catalog dictionary.

### 3.3 Derived expressions (`derived_expressions`)

Composites live on the published guideline edition and are never rows in `nutrients`. They are not extra catalog-table columns.

| Code | Name | AST |
| --- | --- | --- |
| `epa_dha` | EPA + DHA | sum of `EPA`, `DHA` |
| `ca_p_ratio` | Ca:P | ratio `Ca` / `P` |
| `methionine_cystine` | Met + Cys | sum of `Met`, `Cys` |
| `phenylalanine_tyrosine` | Phe + Tyr | sum of `Phe`, `Tyr` |
| `omega6_omega3` | ω6 / ω3 | group ratio `OMEGA_6` / `OMEGA_3` |

### 3.4 FEDIAF structural catalogs (published edition)

| Category | Contents |
| --- | --- |
| Species | `dog`, `cat` (normative comparison); other species skip norms |
| Nutrient standards | Species/life-stage standards with an explicit calculation basis. Adult clinical standards are `dog_adult_maintenance` / `cat_adult_maintenance`; published MER-band profiles remain archival and are not clinician-selectable |
| Size classes | Dog expected-mature-weight bands, derived server-side for growth / calcium context; an advanced session override is traceable |
| Energy scenarios | Species/context-compatible AST energy methods with point or range results and method-specific allowed weight bases; they are confirmed independently from Nutrient Standards |
| Applicability rules | Predicates (feed form, size, age, litter) on targets |
| Animal profile fields | Current body weight, target clinical body weight, expected mature weight, age, lactation week, litter size, activity, neuter, pregnancy, BCS |

### 3.5 Per-species clinical tables

| Category | Contents |
| --- | --- |
| Adult Nutrient Standards | Table VII-11 daily amounts: dog `value × BW^0.75`, cat `value × BW^0.67`, compared to actual daily ration intake; working kcal does not change these minima |
| Growth / reproduction standards | Published life-stage targets per 1000 kcal ME, converted to daily requirements with the clinician-confirmed working energy target |
| Archival adult density profiles | MER95/110 for dogs and MER75/100 for cats remain source/reference rows only; they are absent from clinician Selects, suggestions, and compatibility decisions |
| Energy scenarios | Parameterized server-side methods. Point methods may set a working target on Apply; ranges remain ranges until the clinician selects a point |
| Size / growth / lactation rules | Size-class mapping, growth curves, lactation litter multipliers |
| Scope metadata | Healthy animals only; complete & complementary pet food |
| Out of scope | Disease-specific nutrient profiles unavailable; food-safety mentions are not nutrient targets |

### 3.6 Product catalog (app DB)

Food **browse categories** (import `type` stored as `foods.category`):

`сухие корма` · `влажные корма` · `лакомства` · `добавки` · `белки` · `углеводы` · `жиры` · `клетчатка`

Import also sets stored `type` / `feed_form`:

| Import category | `type` | `feed_form` |
| --- | --- | --- |
| `сухие корма` | `commercial` | `dry` |
| `влажные корма` | `commercial` | `wet` |
| `лакомства` | `commercial` | `unknown` |
| `добавки` | `supplement` | `unknown` |
| `белки`, `углеводы`, `жиры`, `клетчатка` | `ingredient` | `unknown` |

Clinician browse is the category panel + matrix table, not a commercial / ingredient / supplement filter. Stored `type` remains on the Food row and on ration lines.

**Stored values** (`food_nutrient_values`): preferred basis `per_100g_as_fed`. `value = 0` is a known zero; `NULL` + `value_status = unknown` (or absent row) is missing data. Catalog-table empty cell ≠ `0`.

Catalog matrix API (`GET /foods/matrix`): one SPEC group at a time, page size 50, sort by name or one as-fed nutrient (missing last). Ration search on the analysis tab uses summary `GET /foods?q=` (cap 50, no matrix).

### 3.7 Assessment statuses and honesty

Engine statuses (`AssessmentStatus`): `met`, `below_minimum`, `above_maximum`, `not_established`, `not_applicable`, `insufficient_context`, `missing_product_data`.

| Rule | Behavior |
| --- | --- |
| Invalid or incomplete clinical request | HTTP 422 with no verdict or nutrient status table: for example unconfirmed standard, species-mismatched scenario/standard, missing required growth input, or a range method without a required working target |
| Species other than dog/cat | No dog/cat normative comparison; posting dog/cat confirmed codes for another species is invalid |
| Therapeutic goal | Ignored compatibility field; not a skip |
| Mixed / unknown feed form | Form-dependent Se/Tau rows `insufficient_context` until override |
| Missing catalog value | `missing_product_data`; never converted to zero and never counted as `met` |
| Unconvertible Vitamin E | `insufficient_context`; the engine never silently compares catalog mg with a published IU target |
| Valid request with missing evidence | HTTP 200, rows remain explicit, and `overall = indeterminate` |
| Nutritional vs legal maxima | Applicable nutritional constraints may affect the verdict; EU legal maxima remain excluded from the clinical ration verdict |
| Catalog-only nutrients without a FEDIAF target (e.g. `CH`) | Reference rows, not `met` |

### 3.8 Workspace session / persistence

| Category | Role |
| --- | --- |
| Patient picker | Optional `patient_uuid`; prefill without auto-Confirm |
| Confirmed FEDIAF context | Independent `profile_code` (Nutrient Standard) + `energy_formula_code` (Energy Scenario), working target, optional weight/size override, `feed_form` |
| Energy estimates | Server-returned point or range plus a separate clinician-confirmed working target; no lower-bound or midpoint collapse; RER × factor is secondary |
| Ration | Component grams linked to catalog Foods |
| Live analysis | `POST /assessments` recomputes on the server and returns a canonical `input_hash`; relevant edits immediately show `Расчёт устарел`, and late responses are discarded by request sequence |
| Diet Plan snapshot | One JSON snapshot per explicit save; next save replaces it; `GET /diet-plans/{id}` is a pure storage read and does not re-run the engine |
| Historical snapshot | An engine id different from the current engine, or a missing `input_hash`, is marked `Расчёт выполнен предыдущей версией nutrition engine.` and rendered as stored without remap or automatic assessment |
| Current-version recalculation | `Пересчитать по текущей версии` copies only the stored animal/ration as session starting values, clears confirmed standard/scenario/working target, and requires a new explicit confirm → assess → save path using the current engine, published edition, and a new `input_hash` |
