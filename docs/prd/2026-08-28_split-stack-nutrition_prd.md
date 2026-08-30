---
prd_id: 2026-08-28-split-stack-nutrition
cycle_id: 2026-08-28-split-stack-nutrition
cycle_slug: split-stack-nutrition
title: Split-Stack Nutrition
created: 2026-08-28
filename: docs/prd/2026-08-28_split-stack-nutrition_prd.md
project_doc: docs/PROJECT.md
status: draft
scope_type: cycle
source: product-discovery
related_issue_batch: null
---

# PRD: Split-Stack Nutrition

## Cycle Summary

Roadmap **#3 · Core · ⬜ Planned**. Predecessor: **#1 FEDIAF Stronger** (✅ Done, reduced scope). Roadmap **#2 FEDIAF Relational Assessment** is **❌ Cancelled** (in-place Next/Prisma cutover rejected; its clinical outcome is absorbed here).

This cycle replaces the prototype runtime with a split workbench and delivers the nutritionist happy path on PostgreSQL: catalog per Nutrient SPEC, FEDIAF 2025 assessment, reproducible saved plan. Draft until the PRD is approved (`📋 Defined`).

## Goal

A veterinary nutritionist on a local or VPS instance can, in one sitting, optionally open or skip a Client/Patient, confirm animal and guideline context, build a ration from Foods, and receive an honest FEDIAF 2025 nutrient and energy assessment stored as a snapshot on a Diet Plan. The running product reads PostgreSQL only. Next.js does not own business APIs. Unused prototype modules are gone from runtime, not wrapped.

## Current Project Context

- Today’s app is a Next.js monolith (UI + Route Handlers + Prisma). No FastAPI. No auth. Pet embeds owner. FEDIAF runtime is JSON codegen (`fediaf-data.ts`). Catalog uses string nutrient codes. Quality-bar analysis is not shipped.
- Cycle 2 described Postgres guidelines **inside that monolith**. That path is cancelled.
- PostgreSQL already exists at `127.0.0.1:15432` (local and VPS). Vercel and Neon are removed as product/deploy targets.
- Rebuild is greenfield: do not migrate Pet, Consultation, photos, or old Diet Plans.
- `docs/Nutrient SPEC.md` is the catalog/value contract. `docs/VetDietDerm_FEDIAF_Data_Architecture_Spec.md` remains the FEDIAF semantics reference; its Prisma/Next runtime assumptions do not apply.

## New Functionality

1. **Split workbench**
   - Frontend: Next.js + TypeScript + Tailwind (clinician UI, Russian).
   - Backend: one FastAPI process with Pydantic contracts and internal modules (`patients`, `catalog`, `guidelines`, `assessments`).
   - UI calls FastAPI only. No product Next.js API routes. No Prisma.
   - Instance password protects the API (and thus the UI). Not per-user roles.
   - Run against existing PostgreSQL; this cycle does not add Docker Compose, Vercel, or Neon.

2. **Client and Patient**
   - Client = owner (name and contact fields sufficient to identify later CRM work).
   - Patient = animal (species, breed as text, weight, age/life stage, activity, neuter, pregnancy/lactation/litter, BCS as needed for energy and stage).
   - Simple create/edit/search. No Encounter, schedule, gallery, or communications.

3. **Food catalog (Nutrient SPEC)**
   - One Food entity with type `commercial` | `ingredient` | `supplement`.
   - Shared Nutrient dictionary (`code` is the business identifier), `food_nutrient_values` (basis, `value_status`, optional source), nutrient groups (e.g. OMEGA_3 / OMEGA_6).
   - Preferred stored basis `per_100g_as_fed`; other bases calculated when needed. `NULL` is missing data; `0` is a known zero.
   - CLI import from `products_normalized.json` into PostgreSQL.
   - Clinician can create and edit Food and nutrient values in the UI.

4. **FEDIAF 2025 in PostgreSQL**
   - CLI import from the FEDIAF 2025 JSON snapshot into versioned guideline tables (edition, profiles, targets, applicability, energy formulas, source refs as required for assessment).
   - JSON stays an import artifact. The running API and UI never load it.
   - Edition publish is CLI-only.

5. **Dietetics happy path**
   - Works with a selected Patient or a manual profile (no Patient).
   - Suggestion-only inference for life stage, energy formula, and dog size class; clinician must confirm before normative comparison and FEDIAF MER.
   - Therapeutic-goal flag: no FEDIAF normative comparison (healthy-animal guideline only).
   - Ration from Foods (grams); infer `feedForm` when uniform; mixed/unknown → insufficient data for form-dependent targets (selenium, taurine); clinician may override.
   - Energy: FEDIAF MER primary; RER × factor as secondary cross-check.
   - Analysis table: nutrient or derived expression, ration per 1000 kcal ME, FEDIAF target, honest status, completeness, source at least at edition level (row/table/page when imported).
   - Statuses must distinguish: met, below minimum, above maximum, not established, not applicable, insufficient context, missing product data. Null is never a passed minimum.

6. **Saved Diet Plan snapshot**
   - Save (with or without Patient) persists the ration plus one assessment snapshot (edition, confirmed context, engine identity, ration, results).
   - Reopening shows that snapshot; do not silently recompute against a newer engine or edition.
   - Next save of the same plan replaces the snapshot. No assessment history timeline.

## Changed Existing Functionality

- The prototype is the old product, not a layer to keep. Runtime removal includes: Next.js Route Handlers as backend, Prisma, JSON/codegen FEDIAF path, combined Pet+owner, knowledge/AI, share portal, drug checker, appointments UI, derm gallery, `/projects` aliases, SQLite leftovers, websocket demo, Vercel/Neon wiring.
- English UI is not shipped this cycle (Russian only).
- Old Diet Plans with `fediafMeta` are not migrated and are not opened as “legacy assessments”.
- Dual-run against the old TypeScript engine is not a product requirement (that engine is deleted).

## Product Architecture Impact

- App shape: UI app + one API process + existing PostgreSQL. Foundation for later modules is Client/Patient and FastAPI module boundaries, not empty Encounter tables and not multiple processes.
- Catalog and guidelines use the same canonical atomic nutrient codes directly. Composites are derived.
- Non-functional: instance-level access only; published guideline rows not edited in place; clinical disclaimer visible; no PII beyond Client/Patient/plan fields; dataset is small.
- Hosting: operator runs Next and FastAPI against Postgres already listening on port 15432. This cycle does not deliver orchestration.

## Functional Nuances

- Single-tenant instance. Import/publish is an operator concern (CLI), not a clinician admin hub.
- Manual profile and Patient-backed profile must use the same confirm + gate rules.
- Incomplete states must not look like success: unconfirmed stage, therapeutic gate, unknown feed form for Se/Tau, missing catalog values, missing MER parameters.
- Mixed wet/dry rations are valid; they simply cannot resolve form-dependent targets without override.
- Food types share one ration builder; the clinician is not forced through two catalogs.
- i18n: Russian UI; imported Russian guideline strings.

## Data, Integrations, and Constraints

- PostgreSQL `127.0.0.1:15432`.
- Nutrient/catalog rules: `docs/Nutrient SPEC.md` (UUIDs, `code`, `base_unit`, groups, calculated ratios).
- Import sources: `products_normalized.json`, `docs/fediaf_2025_veterinary_nutrition_database_ru.json` (+ schema). Checksum/idempotent re-import is an engineering concern; product rule is repeatable load into Postgres without the app reading those files.
- No new third-party SaaS. No owner portal. No NRC/AAFCO selectable standard.
- Open prototype APIs go away; the instance password is the access boundary.

## Out of Scope for This Cycle

- Encounters, appointments, derm gallery, communications, knowledge, AI handouts, owner share portal, drug checker
- Per-user accounts, roles, multi-clinic tenancy
- Docker Compose, Kubernetes, Vercel, Neon
- Multiple FastAPI processes / API gateway
- Migrating existing prototype database rows
- Breed notes, complementary-only analysis branch, therapeutic nutrient profiles
- In-app guideline edition admin / FEDIAF browse hub
- English UI, billing, offline mode, real-time collaboration
- Assessment history timeline; auto-recompute of saved plans

## Open Questions

- Exact `source_uuid` product meaning and whether a Source list is needed beyond optional FK
- Coverage threshold for “insufficient catalog coverage” (prototype used 60%; keep unless a documented FEDIAF rule appears)
- How commercial vs wet/dry is encoded on imported Foods (infer from category/name during import; do not make the clinician reclassify every SKU twice)
- Password storage/transport on VPS (env vs file) — engineering, as long as the instance is not open
