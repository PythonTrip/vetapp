---
title: Nutrient
module: nutrition
updated: 2026-08-31
scope: nutrition-nutrient-inventory
related: docs/PROJECT.md
---

# Nutrient

Reference note for the VetDietDerm Nutrition (dietetics) module: purpose, data sources, and data categories on the split stack.

## 1. Module overview

The Nutrition workspace (`/nutrition`) is a clinician-facing dietetics assistant for healthy dogs and cats. It helps a veterinary nutritionist, in one sitting:

1. Select a Patient (search by animal or owner) or keep a manual profile.
2. Let the server resolve the Nutrient Profile and Energy Formula from the animal card.
3. Review reference and working energy; optionally adjust working energy by percentage (RER × factor remains a secondary cross-check).
4. Build a ration from the Food catalog in grams.
5. Compare daily intake to the applicable published per-1000-kcal profile scaled by working energy.
6. Save a Diet Plan with one assessment snapshot (edition, resolved context, engine identity, input hash, ration, results).

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

Pipeline: JSON snapshot → `uv run --project apps/api python -m vetdietderm_api.guidelines.import_fediaf` → validate → CLI publish. The running engine (`nutrition-engine/2.0.0`) loads only the **published** FEDIAF edition from PostgreSQL. NRC 2006, CSV-based FEDIAF generation, and TypeScript `fediaf-data.ts` are not in runtime.

Auto-selected adult, growth, and reproduction profiles use `published_per_1000_kcal`; daily requirements are derived with `target × working_energy_kcal / 1000`. Table VII-11 `daily_per_metabolic_bw` profiles remain stored as reference data. Null / not-established values mean “not set in the source table,” not zero.

## 3. Data categories

### 3.1 Canonical nutrients (`nutrients`)

Shared dictionary for catalog and guidelines. Seeded in Alembic `0003_food_catalog` (**51 atomic codes**). `code` is the business identifier. Categories:

| Category | Codes | Base units |
| --- | --- | --- |
| `main` | `ME`, `CP`, `CFa`, `CFi`, `CAs`, `CH`, `MO`, `DM` | `kcal/100g` (`ME`); `g` (rest), all `per_100g_as_fed` |
| `mineral` | `Ca`, `P`, `Mg`, `Na`, `K`, `Cl`, `Fe`, `Cu`, `Zn`, `Mn`, `I`, `Se` | `mg` except `Se` (`mcg`) |
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
| Nutrient standards | Species/life-stage standards with an explicit calculation basis. Adult standards resolve to dog MER95/110 or cat MER75/100; `clinician_selectable` affects manual/admin lists only |
| Size classes | Dog expected-mature-weight bands, derived server-side for growth / calcium context; there is no client override |
| Energy formulas | Species/context-compatible AST methods with point or range results, resolved independently from Nutrient Profiles by the server |
| Applicability rules | Predicates (feed form, size, age, litter) on targets |
| Animal profile fields | Current body weight, target clinical body weight, expected mature weight, age, lactation week, litter size, activity, neuter, pregnancy, BCS |

### 3.5 Per-species clinical tables

| Category | Contents |
| --- | --- |
| Adult Nutrient Standards | Dog low activity → MER95, other adult dog → MER110; cat indoor/low-activity or neutered → MER75, active adult cat → MER100 |
| Growth / reproduction standards | Existing life-stage profiles, converted to daily requirements with server-computed working energy |
| Table VII-11 adult profiles | Retained in PostgreSQL as reference profiles but no longer auto-selected for adults |
| Energy formulas | Point → reference point; range → midpoint reference; `working = reference × adjustment% / 100` |
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

**Stored values** (`food_nutrient_values`): preferred basis `per_100g_as_fed`. Canonical `ME` is **kcal/100 g as fed**; `CP`, `CFa`, `CFi`, `CAs`, `MO`, `CH`, and `DM` are g/100 g as fed. Values around 3000–4500 kcal are kcal/kg and are rejected. `value = 0` is a known zero; `NULL` + `value_status = unknown` (or absent row) is missing data. Catalog-table empty cell ≠ `0`.

Assessment energy is `grams × ME / 100`. Daily RER/MER is a separate animal-requirement module.

Catalog matrix API (`GET /foods/matrix`): one SPEC group at a time, page size 50, sort by name or one as-fed nutrient (missing last). Ration search on the analysis tab uses summary `GET /foods?q=` (cap 50, no matrix).

### 3.7 Assessment statuses and honesty

Engine statuses (`AssessmentStatus`): `met`, `below_minimum`, `above_maximum`, `not_established`, `not_applicable`, `insufficient_context`, `missing_product_data`.

| Rule | Behavior |
| --- | --- |
| Invalid or incomplete clinical request | HTTP 422 with no verdict or nutrient status table when required animal-card inputs for the resolved formula are missing |
| Species other than dog/cat | No dog/cat normative comparison; resolved profile/formula codes are null |
| Therapeutic goal | Ignored compatibility field; not a skip |
| Mixed / unknown feed form | Form-dependent Se/Tau rows `insufficient_context` until override |
| Missing catalog value | `missing_product_data`; never converted to zero and never counted as `met` |
| FEDIAF minerals in `g` (`Ca`, `P`, `Mg`, `Na`, `K`, `Cl`) | Converted once on provider load (`1 g = 1000 mg`); targets and catalog values then use canonical `mg` |
| Other FEDIAF minerals | `Fe`, `Cu`, `Zn`, `Mn`, `I` stay in `mg`; `Se` stays in `mcg` |
| API/UI units | Nutrition engine and catalog API own unit strings; frontend displays returned units without remapping or conversion |
| Unconvertible Vitamin E | `insufficient_context`; the engine never silently compares catalog mg with a published IU target |
| Valid request with missing evidence | HTTP 200, rows remain explicit, and `overall = indeterminate` |
| Nutritional vs legal maxima | Applicable nutritional constraints may affect the verdict; EU legal maxima remain excluded from the clinical ration verdict |
| Catalog-only nutrients without a FEDIAF target (e.g. `CH`) | Reference rows, not `met` |

### 3.8 Workspace session / persistence

| Category | Role |
| --- | --- |
| Patient picker | Optional `patient_uuid`; edits feed the next automatic server resolution |
| Resolved FEDIAF context | Server-owned `nutrient_profile_code` + `energy_formula_code`, derived size class, and `feed_form` |
| Energy estimates | Separate `reference_energy_kcal` and `working_energy_kcal`; ranges use midpoint; RER × factor is secondary |
| Ration | Component grams linked to catalog Foods |
| Live analysis | `POST /assessments` recomputes on the server and returns a canonical `input_hash`; relevant edits immediately show `Расчёт устарел`, and late responses are discarded by request sequence |
| Diet Plan snapshot | One JSON snapshot per explicit save; next save replaces it; `GET /diet-plans/{id}` is a pure storage read and does not re-run the engine |
| Historical snapshot | An engine id different from the current engine, or a missing `input_hash`, is marked `Расчёт выполнен предыдущей версией nutrition engine.` and rendered as stored without remap or automatic assessment |
| Current-version recalculation | `Пересчитать по текущей версии` copies the stored animal/ration as session starting values and immediately uses current server resolution, published edition, and a new `input_hash` |
