---
project_id: vetdietderm
title: VetDietDerm
updated: 2026-08-27
source: product-discovery
---

# Project: VetDietDerm

## Project Description

VetDietDerm is a veterinary clinical workbench for specialists who manage patients, consultations, and follow-up. The first focus segments are veterinary dermatologists and nutritionists. The product does not replace clinical judgment: calculators and guidance must show sources, versions, and leave the final decision to the clinician.

## Target Users

- Private-practice veterinary nutritionists and dermatologists
- Small specialty clinics and cabinets
- Assistants and admins who schedule visits and owner communications (later CRM depth)

Primary user for the next cycle: the veterinary nutritionist working in the Nutrition module.

## Business Model

B2B software for private specialists and small clinics (assumption from current product direction). Monetization details are not fixed in this discovery pass.

## Product Vision

Become the primary work window across the treatment cycle: client and patient → scheduled encounter → structured clinical record → reproducible calculations and diet plans → follow-up. Dermatology and nutrition are specialization packs on a shared clinical core, not separate apps.

Near-term product emphasis: a trustworthy FEDIAF 2025-backed dietetics assistant that turns patient context and ration building into a reproducible nutrient and energy assessment for healthy dogs and cats.

## Current Functionality

Shipped in the functional prototype (single-tenant, no auth):

- Pet cards with embedded owner fields, search, CSV import/export
- Consultations with specialty, structured anamnesis, diagnoses/prescriptions JSON
- Appointments, reminders, communication log, owner share-token portal
- Dermatology lesion photo gallery (base64) and VAS
- Diet plans (RER/MER, macros/template JSON)
- Nutrition workspace: product catalog, RER/MER, dry matter, diet builder, nutrient analysis
- FEDIAF 2025 norms and MER generated exclusively from the versioned JSON database; analysis uses the clinician-confirmed stage with no alternate NRC norm standard, while RER × factor remains a secondary energy cross-check
- Knowledge tools: allergens, elimination wizard, handouts (optional AI), drug interactions UI
- i18n en/ru, theme, backup JSON

Known limits: Pet+owner combined model; open APIs; clinical fields often as JSON strings; the FEDIAF ration-analysis quality-bar issue remains pending.

## Product Cycle Roadmap

| # | Status | Stage | Cycle | Product Outcome | PRD / Issues |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚧 In Progress | Core | FEDIAF Stronger | Nutritionist gets a trustworthy FEDIAF 2025 dietetics assistant: JSON source of truth, patient→stage→MER→norms→ration analysis, legacy NRC/CSV removed | [draft PRD](prd/2026-08-27_fediaf-stronger_prd.md) |
| 2 | ⬜ Planned | Core | Clinical CRM Pivot | Client/Patient/Encounter workspace with auth, roles, attachments, and calculations stored on the encounter | — |
| 3 | ⬜ Planned | Pro | Specialty Depth | Stronger derm/nutrition encounter templates, follow-up CRM, and additional clinical calculators (dose, fluids) | — |
| 4 | ⬜ Planned | Platform | Pilot Hardening | Audit, backups, medical-data protections, and pilot readiness for multi-user clinics | — |

## Product Architecture

- Single Next.js App Router application (UI + Route Handlers) with PostgreSQL via Prisma; deploy target Vercel
- Nutrition clinical engine consumes a versioned FEDIAF 2025 JSON database (with schema) through codegen into a typed module; runtime does not parse the full JSON on each request
- Core clinical objects today center on Pet, Consultation, DietPlan, NutritionProduct; future pivot introduces Workspace, Client, Patient, Encounter, Calculation, Attachment
- FEDIAF scope is healthy dogs/cats and complete/complementary pet-food guidelines; disease-specific therapeutic nutrient profiles are out of FEDIAF and must be gated in product behavior

## Data, Integrations, and Constraints

- Source of truth for guidelines: `docs/fediaf_2025_veterinary_nutrition_database_ru.json` + `docs/fediaf_2025_veterinary_nutrition_schema.json`
- External reference: FEDIAF Nutritional Guidelines PDF (version shown in `database_meta`)
- Product catalog remains separate (`NutritionProduct` / normalized product import)
- No multi-tenant auth yet; all API routes are currently open in the prototype
- Clinical outputs must remain informational with explicit disclaimer; formulas use mathjs-compatible expressions from the database metadata
- Localization: FEDIAF content in the database is Russian (`language: ru`); app UI remains en/ru

## Known Decisions

- Next executable Core cycle is **FEDIAF Stronger**; key product value is a quality dietetics assistant
- Happy path must work with and without a selected patient
- Life-stage / formula inference is suggestion-only; clinician confirms
- Disease / therapeutic goals trigger a hard “outside FEDIAF scope” gate
- Legacy CSV FEDIAF pipeline and NRC 2006 norm standard are removed in this cycle; RER × factor remains as secondary energy cross-check
- Diet Plan persistence stores FEDIAF version, stage, and disclaimer with the plan
- Pregnancy, lactation (incl. litter parameters), and dog size classes are in scope for energy/stage correctness
- Full CRM pivot, Calculation-on-Encounter entity, owner-facing FEDIAF reports, and a standalone FEDIAF browse hub are deferred

## Cycle History

- 2026-08-27 — Product discovery established `docs/PROJECT.md` and drafted cycle 1 PRD for FEDIAF Stronger.

## Open Product Questions

- Concrete B2B pricing and packaging
- Whether `docs/fediaf_2025_veterinary_nutrition_ru.xlsx` should later be deleted or kept only as archival source
- Whether complementary-food scenarios need a dedicated analysis path beyond complete-feed norm orientation
- Exact DietPlan JSON field names for FEDIAF metadata (engineering detail for implementation)
