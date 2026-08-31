---
project_id: vetdietderm
title: VetDietDerm
updated: 2026-08-30
source: product-discovery
---

# Project: VetDietDerm

## Project Description

VetDietDerm is a veterinary clinical workbench for specialists who manage patients, consultations, and follow-up. The first focus segments are veterinary dermatologists and nutritionists. The product does not replace clinical judgment: calculators and guidance must show sources, versions, and leave the final decision to the clinician.

## Target Users

- Private-practice veterinary nutritionists and dermatologists
- Small specialty clinics and cabinets
- Assistants and admins who schedule visits and owner communications (later CRM depth)

Primary remaining Core work is Clinical CRM Pivot (#5). The nutrition workbench is closed through cycle #6.

## Business Model

B2B software for private specialists and small clinics (assumption from current product direction). Monetization details are not fixed.

## Product Vision

Become the primary work window across the treatment cycle: client and patient → scheduled encounter → structured clinical record → reproducible calculations and diet plans → follow-up. Dermatology and nutrition are specialization packs on a shared clinical core, not separate apps.

Near-term product emphasis: a trustworthy FEDIAF 2025 dietetics assistant on a split stack (Next.js UI, FastAPI API, PostgreSQL). Guideline and catalog data are versioned in the database. The application does not use JSON files or generated TypeScript guideline modules at runtime.

The nutrition workbench lets the clinician start from a real Patient (or a manual profile), browse the Food catalog as a nutrient table, and assess a ration against FEDIAF for dogs and cats. Energy need and nutrient norms are independent clinical questions, joined only by animal-context compatibility — not by an application-owned `energy_formula → nutrient_profile` pair. The clinician works a scenario (animal, energy method, nutrient standard, ration), not internal database objects. Disease-specific therapeutic nutrient profiles remain a later specialization, not a hidden switch that blanks the current analysis.

The rebuild laid a foundation for CRM and specialty packs: separate Client and Patient, modular API bounded contexts, one FastAPI process that can be split later. Clinical encounters, templates, attachments, appointments, and communications now sit on that core.

## Current Functionality

Shipped runtime is the **split stack**: Next.js UI in `frontend/`, one FastAPI process in `apps/api/`, PostgreSQL at `127.0.0.1:15432`, instance password. Prisma and Next.js Route Handlers are not in runtime.

- Client and Patient as separate entities; search, create, edit; patient card fields include allergies, chronic conditions, and feeding notes
- Encounters on the patient card and `/encounter`: specialty (dermatology / nutrition / general), SOAP, structured anamnesis, VAS 1–10, statuses draft / in progress / completed
- Encounter templates for anamnesis, exam, and plan; scopes `standard` (read-only), `clinic`, and `doctor`
- Dermatology gallery: lesion photos and PDFs stored on disk (`ATTACHMENT_DIR`), metadata and VAS in PostgreSQL, optional link to an encounter
- Schedule (`/schedule`): day list of appointments with visit type and status, create / reschedule / cancel, deep-link to the patient card
- Communication log on the patient card (channel, direction, follow-up time)
- Nutrition workspace (`/nutrition`) tabs: **Рацион и анализ**, **Недавние планы**, **Каталог Foods**
- Patient picker on the ration tab: search by animal or owner, or stay on «Без пациента · ручной профиль»; `?patientId=` from the patient card still prefills; Patient remains optional on save
- Food catalog: category/subcategory panel (eight import buckets; subcategories mostly brands), paged as-fed nutrient matrix by SPEC group, server sorting, 50-row load-more, name search; empty until a category or search is set
- Ration builder; honest FEDIAF 2025 assessment from PostgreSQL guidelines; replace-on-save Diet Plan snapshot
- Dog/cat assessments resolve `energy_formula_code` and `nutrient_profile_code` on the server from the animal card; exact profile/formula pairing is not a 422. `therapeutic_goal` remains an ignored compatibility field
- Adult standards use imported MER profiles automatically: dog low activity → MER95, other adult dog → MER110; cat indoor/low-activity or neutered → MER75, active adult cat → MER100. Table VII-11 remains stored as reference data
- Energy is stored as formula reference kcal and adjusted working kcal. Point formulas use the calculated point; range formulas use the midpoint; a percentage adjustment is applied afterward. RER × factor is a secondary cross-check
- Current, target, and expected mature weights are distinct; dog size class is derived server-side from expected mature weight with no UI override
- Relevant input edits mark the visible assessment stale; the response carries `input_hash`; late responses cannot restore an older calculation
- Legacy Diet Plans render as stored without remap or auto-recompute; current-version recalc is an explicit clinician action
- Food rows have no species compatibility; ration search does not filter cat-only commercial foods away from a dog patient
- Russian UI, theme toggle, instance lock screen

Not shipped: Food `species_compatibility` (dropped from cycle #6), users/roles, owner share portal, knowledge/AI handouts, drug checker, English UI, Prisma data migration, S3, dose/fluids calculators.

## Product Cycle Roadmap

| # | Status | Stage | Cycle | Product Outcome | PRD / Issues |
| --- | --- | --- | --- | --- | --- |
| 1 | ✅ Done | Core | FEDIAF Stronger | Nutritionist can run a confirmed FEDIAF 2025 happy path on the prototype (JSON SoT, stage confirm, therapeutic gate, Diet Plan `fediafMeta`); NRC/CSV runtime removed. Quality bar was not shipped. | [PRD](prd/2026-08-27_fediaf-stronger_prd.md) · [issues](issues/fediaf-stronger/) |
| 2 | ❌ Cancelled | Core | FEDIAF Relational Assessment | Trustworthy Postgres-backed ration analysis on the Next/Prisma prototype. Cancelled: same clinical outcome is delivered on a new stack in cycle 3; in-place Prisma refactor was rejected. | [PRD](prd/2026-08-28_fediaf-relational-assessment_prd.md) |
| 3 | ✅ Done | Core | Split-Stack Nutrition | Nutritionist uses a rebuilt workbench (Next.js UI + one FastAPI process + existing PostgreSQL): Client/Patient, Food catalog, ration, honest FEDIAF 2025 assessment, reproducible saved plan. Legacy prototype modules left runtime. Therapeutic-goal gate from this cycle was later removed in #4. | [PRD](prd/2026-08-28_split-stack-nutrition_prd.md) · [issues](issues/split-stack-nutrition/) |
| 4 | ✅ Done | Core | Nutrition Workbench Polish | Nutritionist picks a Patient on `/nutrition`, browses Foods as a category-filtered nutrient table, and always gets a FEDIAF comparison after confirm — no therapeutic-goal switch. Confirmed profile and MER formula were strictly paired until #6. | [PRD](prd/2026-08-29_nutrition-workbench-polish_prd.md) · [issues](issues/nutrition-workbench-polish/) |
| 5 | 🚧 In Progress | Core | Clinical CRM Pivot | Client/Patient/Encounter workspace with schedule, attachments, communications, and encounter templates on the split stack. Users/roles and encounter-stored calculations are still later. | — |
| 6 | ✅ Done | Core | Nutrition Context Split | Energy formulas and nutrient profiles remain independent; the server resolves both from the animal card, adult verdicts use imported MER95/110 and MER75/100 profiles, and stale results cannot look valid. | [PRD](prd/2026-08-29_nutrition-context-split_prd.md) |
| 7 | ⬜ Planned | Pro | Specialty Depth | Stronger derm/nutrition encounter templates, follow-up CRM, additional clinical calculators (dose, fluids), and disease-specific therapeutic nutrient profiles if still wanted | — |
| 8 | ⬜ Planned | Platform | Pilot Hardening | Audit, backups depth, medical-data protections, and multi-user clinic readiness on VPS | — |

## Product Architecture

- **Web:** Next.js + TypeScript + Tailwind in `frontend/` — UI only. No Next.js Route Handlers as the product backend; no Prisma in the rebuilt runtime. Clinical calculations are not duplicated in React.
- **API:** one FastAPI process (Pydantic contracts) with internal bounded contexts (`patients`, `encounters`, `encounter_templates`, `attachments`, `appointments`, `communications`, `catalog`, `guidelines`, `assessments`). Module boundaries are the foundation for later extraction; multiple API processes remain deferred.
- **Data:** existing PostgreSQL at `127.0.0.1:15432` (local and the already-provisioned VPS instance). No Vercel, no Neon. No Docker Compose / orchestration as a cycle deliverable.
- **Access:** single instance password (not per-user roles).
- **Core entities:** Client (owner), Patient (animal), Encounter, EncounterTemplate, Appointment, Attachment (disk + metadata), Communication, Food (commercial / ingredient / supplement stored, but catalog browse is by import `category` / `subcategory`), Nutrient and `food_nutrient_values` (see `docs/Nutrient.md`), FEDIAF guideline edition data in PostgreSQL, Diet Plan with a replaced-on-save assessment snapshot.
- **Nutrition analysis model:** Animal Context lets the server independently resolve an Energy Formula and Nutrient Profile. Compatibility is species + physiological context + required fields — not `energy_formula.profile_id`. Adult verdicts use imported MER95/110 and MER75/100 concentration profiles; growth and reproduction keep their published life-stage profiles. Table VII-11 remains available as reference data but is not auto-selected for adults.
- **Later entities:** User/Role, signed encounter, S3 object store, specialty calculators. They must attach to Client/Patient without collapsing owner back into Patient.
- Disease-specific therapeutic profiles are not a product mode. Species other than dog/cat still skip normative comparison.

## Data, Integrations, and Constraints

- Operational source of truth after the rebuild: PostgreSQL only.
- Catalog and nutrient values: 51 atomic nutrients seeded in migration `0003_food_catalog` (`main`, `mineral`, `vitamin`, `amino_acid`, `fatty_acid`); `NULL` ≠ 0; preferred stored basis `per_100g_as_fed`; derived ratios calculated; optional `source_uuid`. Inventory and runtime semantics: `docs/Nutrient.md`.
- Food `category` / `subcategory` come from catalog import (`type` / `subcat` in `products_normalized.json`). Categories are the eight import buckets; subcategories are mostly brands.
- Import artifacts (CLI only, never read by the running UI or API): `docs/data/products_normalized.json` (catalog) and `docs/data/fediaf_2025_veterinary_nutrition_database_ru.json` (+ schema). Cycle #6 added Table VII-11 adult daily amounts to that JSON SoT. Clinician can also create/edit Food in the UI.
- External reference: FEDIAF Nutritional Guidelines PDF (edition metadata, currently `2025.09`), including Table VII-11 for adult daily minima and life-stage concentration tables (III-3 / III-4 / VII-17 / VII-18) for growth, reproduction, and archival adult densities.
- Archival only: `docs/data/fediaf_2025_*.csv`, `docs/data/fediaf_2025_veterinary_nutrition_ru.xlsx`. Table VII-11 is not in those files today.
- Clinical outputs remain informational with an explicit disclaimer (`GET /guidelines/active` `clinical_warning_ru`).
- UI language: Russian. FEDIAF import content is Russian.
- Guideline import/publish remains operator CLI, not an unauthenticated public API.

## Known Decisions

- Full rebuild is authorized; unused prototype modules may be deleted rather than migrated.
- No migration of existing Pet/Consultation/DietPlan/Prisma rows. Catalog and guidelines are imported fresh into PostgreSQL.
- Split-Stack Nutrition (#3), Nutrition Workbench Polish (#4), and Nutrition Context Split (#6) are closed. Clinical CRM Pivot (#5) remains In Progress and is the remaining Core cycle. Cycle 2 is cancelled, not deferred.
- Happy path works with and without a saved Patient; a Diet Plan may be saved without a Patient. The nutrition workspace offers a searchable Patient picker (animal and owner), plus the `?patientId=` deep-link and the save dialog.
- Selecting a Patient prefills the animal form for this sitting. Fields stay editable as session overrides. Nutrition-session overrides (including `target_body_weight_kg`) are not written back to the Patient card.
- Client and Patient are separate; owner is not embedded on the animal row.
- One Food catalog. Clinician browse is a category panel (`category` + `subcategory`), not a commercial / ingredient / supplement type filter. Stored `type` remains on the Food row for import and ration metadata.
- Catalog table is the primary catalog view: sticky food name, nutrient columns by group (tabs: main, mineral, vitamin, amino_acid, fatty_acid), values on `per_100g_as_fed`. Empty catalog table until the clinician selects a category or searches by name. Page size 50 with load-more. Sort by one nutrient column, missing values last.
- Category panel: several categories may be active. Hover (desktop) or first tap (touch) opens subcategories. Clicking a category selects all of its subcategories; clicking again clears that category.
- Energy-formula and nutrient-profile inference is server-owned. Every assessment and Diet Plan save resolves both codes again from the animal card; the client neither selects nor submits them.
- **Rejected application invariant:** an energy formula does not own exactly one nutrient profile. Exact-pair 422 was an application assumption, not a FEDIAF rule, and was removed in #6. Compatibility 422 remains for species mismatch, invalid physiological context, and missing required fields (for example growth formula without current weight or expected mature weight; lactation without week / litter size).
- Adult profile resolution is deterministic: dog `activity=low` → `dog_adult_mer95`, other adult activity → `dog_adult_mer110`; cat neutered or low-activity/indoor → `cat_adult_mer75`, otherwise → `cat_adult_mer100`.
- Adult and growth/reproduction concentration targets become daily requirements as `target_per_1000_kcal × working_energy_kcal / 1000`; stored `guideline_targets` are not rewritten.
- `current_body_weight_kg`, `target_body_weight_kg`, and `expected_mature_weight_kg` are distinct. The server uses target BW only when present and allowed by the resolved formula. Expected mature weight drives dog growth and server-derived size class.
- Energy formulas preserve their point/range result. `reference_energy_kcal` is the point or range midpoint; `working_energy_kcal = reference_energy_kcal × energy_adjustment_percent / 100`. No user method or range-point selection blocks assessment creation.
- Kitten and other `k × MER` formulas resolve their adult base MER on the server; a range base uses the same midpoint rule.
- RER × factor remains a secondary energy cross-check and must not share visual weight with the primary FEDIAF energy result.
- No therapeutic-goal control in the UI. Dog/cat rations receive the healthy-animal FEDIAF comparison after server resolution; non-dog/cat species skip norms. Disease-specific therapeutic profiles stay later.
- `feedForm`: infer when the ration is uniformly wet or dry; mixed/unknown → insufficient data for form-dependent targets; clinician may override.
- Canonical nutrient is atomic; composites (EPA+DHA, Ca:P, Met+Cys, Phe+Tyr, ω6/ω3, /DM, /ME) are calculated, not stored as nutrients, and are not extra catalog-table columns.
- Null / not-established is never treated as zero and never counted as a met minimum. Legal maxima stay out of the clinical ration verdict (Nutrition Trust Reset behavior preserved). Nutritional maxima remain separate concentration constraints.
- One assessment snapshot per Diet Plan save (replaced on the next save). Migration `0016` moves legacy confirmation keys to resolved snapshot codes without recalculating stored results; a new assess/save uses current rules.
- Food `species_compatibility`, species-filtered search, and ration-level mismatch confirmation are **out of cycle #6**. Catalog and ration Add remain name/category search without a species gate.
- Breed notes, complementary-only analysis branch, NRC/AAFCO, knowledge/AI, share portal, drug checker, English UI, per-user roles, and Docker/Vercel/Neon remain later. Encounters, templates, derm gallery, schedule, and communications sit on the split stack (roadmap #5 in progress) without Prisma or Next API routes.
- Lesion originals live on disk (`ATTACHMENT_DIR`); PostgreSQL stores attachment metadata only. No base64 in the primary tables.
- Multiple API processes are deferred; keep extractable modules in one process.

## Cycle History

- 2026-08-27 — Product discovery established `docs/PROJECT.md` and drafted cycle 1 PRD for FEDIAF Stronger; executable issues created under `docs/issues/fediaf-stronger/`.
- 2026-08-27 — FEDIAF Stronger implementation advanced: JSON SoT codegen, clinical happy path, out-of-scope gate, DietPlan `fediafMeta` persistence, and legacy NRC/CSV runtime removal marked Done. Remaining issue at that time: ration-analysis quality bar.
- 2026-08-28 — Product discovery closed cycle 1 as ✅ Done with reduced scope. Cycle 2 **FEDIAF Relational Assessment** drafted for an in-place Prisma guideline cutover.
- 2026-08-28 — Product discovery **cancelled cycle 2** and registered Core cycle **Split-Stack Nutrition** (#3). Direction: split Next.js / FastAPI, existing PostgreSQL (`127.0.0.1:15432`), Nutrient SPEC catalog, FEDIAF assessment in Postgres, greenfield import, delete unused prototype runtime. Clinical CRM Pivot moved to #4; Specialty Depth #5; Pilot Hardening #6 (VPS, not Vercel/Neon).
- 2026-08-29 — Clinical CRM slice restored on the split stack: Encounter + structured anamnesis/VAS, disk-backed attachments, appointments, communications, then encounter templates (`standard` / `clinic` / `doctor`). That CRM cycle is now roadmap #5 (still 🚧 In Progress). Users/roles and encounter-stored calculations still open. No Prisma row migration.
- 2026-08-29 — Product discovery registered Core cycle **Nutrition Workbench Polish** as roadmap #4 (inserted before CRM): in-workspace Patient picker, category/subcategory catalog table, remove therapeutic-goal gate and control.
- 2026-08-29 — Cycle #4 issues closed: Patient picker, catalog category panel, paged as-fed catalog table, always-run FEDIAF. Cycle #3 treated as Done; remaining `dietetics-happy-path` issue file is stale after the therapeutic-goal reversal.
- 2026-08-29 — Confirmed FEDIAF nutrient profile and MER formula were strictly paired in suggestions, UI, and assessment 422 (cycle #4 close-out). That pairing is an application assumption, not a FEDIAF requirement.
- 2026-08-29 — Product discovery registered Core cycle **Nutrition Context Split** as roadmap #6, in parallel with CRM #5. Direction: decouple Energy Scenario from Nutrient Standard; import Table VII-11 for adult daily minima; clinician UI around scenario not engine objects. Specialty Depth → #7; Pilot Hardening → #8.
- 2026-08-30 — Cycle #6 dropped Food `species_compatibility`, species-filtered search, and ration-level mismatch confirmation. They remain later; this cycle does not add a species gate on the ration Add dialog.
- 2026-08-30 — Cycle #6 **Nutrition Context Split** closed as ✅ Done. Energy Scenario and Nutrient Standard are independent; adult minima use Table VII-11; ranges stay ranges; stale assessments cannot look valid. Remaining Core cycle is Clinical CRM Pivot (#5). Authenticated browser and live PostgreSQL walkthrough were not repeated at close-out.

## Open Product Questions

- Concrete B2B pricing and packaging
- Whether archival CSV/XLSX under `docs/data/` should later be deleted or kept as source archives
- Whether complementary-food scenarios eventually need a dedicated analysis path
- What `source_uuid` on food nutrient values represents in product terms (label, lab, import batch) and whether Source has a clinician UI later
- Mapping confidence from Patient life stage / activity onto energy-method and nutrient-standard suggestions when confidence is low
- When to extract FastAPI modules into separate processes
- Whether English UI returns as a later cycle or stays Russian-only
- Whether a later cycle writes nutrition-session overrides (including target body weight) back onto the Patient card
- Whether to restore a standalone Nutrient SPEC document; current inventory lives in `docs/Nutrient.md` and migration `0003_food_catalog`
- CLI import paths (`products_normalized.json` at repo root; FEDIAF JSON under `docs/`) versus the current files under `docs/data/`
- Whether a later cycle adds Food `species_compatibility` and species-filtered ration search
- Whether archival adult density standards (`dog_adult_density_95/110`, `cat_adult_density_75/100`) later get a clinician cross-check surface, or stay data-only
