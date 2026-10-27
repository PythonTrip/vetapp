---
source_prd: docs/prd/2026-10-27_pilot-hardening_prd.md
prd_id: 2026-10-27-pilot-hardening
cycle_id: 2026-10-27-pilot-hardening
cycle_slug: pilot-hardening
project_doc: docs/PROJECT.md
status: Done
---

# Session-Gated Ready

## Implementation Status
Status: Done

## Description
A caller who reaches `/ready` through the site must have the same clinical session as every other clinical route. Without that session the handler does not ping PostgreSQL. `/health` stays a public process check and does not touch the database.

## Requirements
- `GET /ready` and `HEAD /ready` use `Depends(require_clinical_access)` before `ping_database`.
- A request with no `vetapp_session` cookie receives `401` and `{"detail": "Войдите в аккаунт"}`, the same body as `GET /clients` without a cookie in `apps/api/tests/integration/test_api_access.py`.
- That unsigned refusal happens in `require_user` / `session_hash` before `ping_database` runs.
- A signed-in clinical caller of `GET /ready` still receives `200` and `{"status": "ok"}` when `SELECT 1` succeeds, and `503` with `{"detail": "Database unavailable"}` when `ping_database` fails.
- `GET /health` stays without `require_clinical_access`, returns `200` and `{"status": "ok"}`, and does not call `ping_database`.
- Do not add a role, workspace, or token. `X-Vetapp-Workspace` keeps the current default `personal`.
- Update `apps/api/tests/integration/test_api_access.py` so the unsigned `/ready` expectation matches the `401` body above. Leave the unsigned `/health` expectation at `200`.

## Acceptance Criteria
- Unsigned `GET /health` returns `200` and `{"status": "ok"}`.
- Unsigned `GET /ready` returns `401` and `{"detail": "Войдите в аккаунт"}` and does not open a PostgreSQL connection for the ping.
- Signed-in `GET /ready` returns `200` and `{"status": "ok"}` when PostgreSQL accepts `SELECT 1`.
- Signed-in `GET /ready` returns `503` and `{"detail": "Database unavailable"}` when PostgreSQL is unreachable.
- `GET /clients` without a cookie still returns `401` and `{"detail": "Войдите в аккаунт"}`.

## Dependencies
- `docs/issues/pilot-hardening/container-database-probe.md` must be in place first. Compose currently treats unauthenticated `GET /ready` as the container probe; gating `/ready` before the probe moves would stop the UI from starting.
- Existing `require_clinical_access` in `apps/api/src/vetdietderm_api/auth.py`.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/main.py`
- `apps/api/tests/integration/test_api_access.py`
- `apps/api/src/vetdietderm_api/auth.py` (read only unless the missing-cookie refusal is not already `401`)
- `apps/api/src/vetdietderm_api/db.py` (read only)

## Implementation Steps
- [x] Step 1: Add `dependencies=auth` to the `/ready` route in `apps/api/src/vetdietderm_api/main.py`, where `auth` is the existing `[Depends(require_clinical_access)]` list. Keep `ping_database()` inside the handler.
- [x] Step 2: Leave the `/health` handler as a direct `StatusResponse(status="ok")` with no database call and no auth dependency.
- [x] Step 3: Change the unsigned `/ready` assertions in `apps/api/tests/integration/test_api_access.py` from `200` to `401` and `{"detail": "Войдите в аккаунт"}`.
- [x] Step 4: Run the checks in Verification.

## Verification
- `GET /health` with no cookie returns `200` and `{"status": "ok"}`.
- `GET /ready` with no cookie returns `401` and `{"detail": "Войдите в аккаунт"}`.
- `GET /ready` with a clinical session returns `200` and `{"status": "ok"}` while PostgreSQL accepts connections.
- Stop PostgreSQL or use a closed `DATABASE_PORT` for one signed-in `GET /ready` and confirm `503` and `{"detail": "Database unavailable"}`. Restore the working database setting afterward.
- `GET /clients` with no cookie still returns `401` and `{"detail": "Войдите в аккаунт"}`.
