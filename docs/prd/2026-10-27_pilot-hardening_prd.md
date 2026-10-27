---
prd_id: 2026-10-27-pilot-hardening
cycle_id: 2026-10-27-pilot-hardening
cycle_slug: pilot-hardening
title: Pilot Hardening
created: 2026-10-27
filename: docs/prd/2026-10-27_pilot-hardening_prd.md
project_doc: docs/PROJECT.md
status: draft
scope_type: cycle
source: product-discovery
related_issue_batch: null
---

# PRD: Pilot Hardening

## Cycle Summary

Platform cycle **#8**, status `⬜ Planned`, draft until this PRD is approved. It is the next cycle by explicit reprioritization on 2026-10-27, ahead of Pro cycle **#7 Specialty Depth**, which stays Planned and is not a predecessor that must finish first. Predecessor Core cycles **#5** and **#6** are Done. #5 closed on the shipped clinical workspace; signed encounters and encounter-stored calculations moved to #7.

The cycle is done when both of these are true:

- A clinician request calculates FEDIAF only through the in-process provider. The blocked SQL import/publish path is gone from the API process.
- Public `/ready` requires the same clinical session as the other clinical routes and does not touch PostgreSQL without that session. The container still waits for PostgreSQL before the UI starts, on a probe that is not the public site's `/ready`, with no user session and no new token.

## Goal

The deployed clinic app has one nutrition engine and does not offer an anonymous database probe on the public site. The UI still starts only after PostgreSQL answers the container's own probe. Clinicians see the same patients, encounters, and saved plans as before.

## Current Project Context

Shipped product is the split stack: Next.js UI, one FastAPI process, existing PostgreSQL, external module-auth. Assessments read `vetdietderm_api.standards.fediaf.v2025`. Alembic `0019` archived the old SQL guideline tables in schema `legacy_guidelines`. Import and publish commands still exist and refuse to run unless those tables are moved back to `public`. Operator text in `docs/Nutrient.md` still describes that SQL pipeline as the running engine.

`GET /health` and `GET /ready` are public. `/ready` pings PostgreSQL. Docker Compose treats the API as healthy only after an unauthenticated `GET /ready` inside the container, and the frontend waits for that health.

Saved diet plans with missing provenance open as stored (`provider_version` defaults to `legacy/sql` on read) and are not recalculated. Older encounters still open from stored text. Clinical rows with both `tenant_id` and `created_by` null stay inaccessible. There is no working backup or restore.

Accounts and an optional organization already exist. No new roles are required for this cycle.

## New Functionality

- The container probe waits for PostgreSQL before the UI process is started. It is not callable as the public site's `/ready`. It does not use a user session and does not introduce a new token.

## Changed Existing Functionality

- Public `/ready` uses the same clinical session as the other clinical routes. Without that session it does not ping PostgreSQL.
- Public `/health` stays available without a session and stays a process check. It does not ping PostgreSQL.
- SQL FEDIAF import and publish, and code that exists only to run them, leave the API process. The in-process provider remains the only calculation path.
- Operator-facing nutrition instructions stop presenting the SQL import/publish pipeline as the way to load or publish norms.
- Saved plans, stored encounter text, inaccessible ownerless rows, the food catalog, and gallery files keep their current read behavior.

## Product Architecture Impact

- One FastAPI process and the Next `/api` proxy stay. Module-auth stays external.
- Guideline identity stays in the provider package. Leftover public `guideline_standards` / `guideline_editions` metadata and schema `legacy_guidelines` stay in PostgreSQL; this cycle does not drop them.
- Browser traffic to `/ready` is session-gated. Container startup depends on a separate internal database probe.
- No new role, workspace, or billing boundary.

## Functional Nuances

- A signed-out caller of public `/ready` gets the same class of refusal as a signed-out caller of a clinical route. The refusal does not depend on a database round-trip.
- A signed-in caller of public `/ready` still learns whether PostgreSQL answers.
- If PostgreSQL is down, the container does not become ready and the UI does not start on that account of health.
- If the API process is up and the database probe has not succeeded, `/health` can still report that the process is up.
- Removing the SQL commands must not change a stored diet-plan snapshot, an old encounter document, or a gallery file.
- Personal and organization isolation stay as they are. This cycle does not add roles and does not claim ownerless null rows.

## Data, Integrations, and Constraints

- Source of truth for norms remains the in-process FEDIAF 2025 provider. Source of truth for clinical records, the food catalog, and diet-plan snapshots remains PostgreSQL. Gallery bytes remain on disk.
- Module-auth remains the account directory. This cycle does not back it up and does not back up the clinical database or gallery.
- UI stays Russian.
- Direct FastAPI publish stays loopback-only. nginx continues to proxy only the UI.

## Out of Scope for This Cycle

- Backup and restore of PostgreSQL, gallery files, or module-auth.
- Dropping schema `legacy_guidelines` or leftover `guideline_standards` / `guideline_editions` rows.
- New roles, signed encounters, encounter-stored calculations, dose or fluid calculators, S3, English UI, billing, and a second API process.
- Recalculating legacy diet plans on read.
- Food species compatibility.

## Open Questions

- When backup and restore of the clinical database and gallery files become their own cycle.
- Whether leftover guideline metadata and schema `legacy_guidelines` are dropped in a later cycle.
