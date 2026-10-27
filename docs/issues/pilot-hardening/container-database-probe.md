---
source_prd: docs/prd/2026-10-27_pilot-hardening_prd.md
prd_id: 2026-10-27-pilot-hardening
cycle_id: 2026-10-27-pilot-hardening
cycle_slug: pilot-hardening
project_doc: docs/PROJECT.md
status: Done
---

# Container Database Probe

## Implementation Status
Status: Done

## Description
The API container must wait until PostgreSQL answers before Compose starts the UI. That check stays inside the container, uses no user session and no new token, and is not an HTTP route the public site can call.

## Requirements
- `docker-compose.yml` healthcheck for `api` calls `vetdietderm_api.db.ping_database` in the API image's Python process.
- The healthcheck command exits non-zero when `ping_database` raises, including `HTTPException` 503 `Database unavailable`.
- `frontend` keeps `depends_on.api.condition: service_healthy`.
- Do not add an HTTP route for this probe. `frontend/src/app/api/[...path]/route.ts` forwards every path, so a new unauthenticated route would become a public database probe.
- Do not add a token, password, or session cookie to the healthcheck.
- Leave `GET /health` and `GET /ready` behavior to `session-gated-ready`. This issue only changes the Compose probe.

## Acceptance Criteria
- With reachable `DATABASE_*`, `docker compose up` reports `api` healthy and then starts `frontend`.
- With an unreachable database port, `api` stays unhealthy and `frontend` does not start.
- The healthcheck command does not request `http://127.0.0.1:8000/ready` or any other URL.
- No new FastAPI route is added for the probe.

## Dependencies
- Existing `vetdietderm_api.db.ping_database` in `apps/api/src/vetdietderm_api/db.py`.
- Assumption: the probe is an in-process call because the Next.js `/api` proxy forwards every upstream path.

## Files Likely Touched
- `docker-compose.yml`
- `apps/api/src/vetdietderm_api/db.py` (read; change only if the healthcheck cannot call `ping_database` as it exists)

## Implementation Steps
- [x] Step 1: Replace the `api` healthcheck `python -c` URL open of `http://127.0.0.1:8000/ready` with an in-process call to `vetdietderm_api.db.ping_database`.
- [x] Step 2: Keep `interval`, `timeout`, `retries`, `start_period`, and `frontend.depends_on` as they are.
- [x] Step 3: Confirm `apps/api/src/vetdietderm_api/main.py` has no new route and `frontend/src/app/api/[...path]/route.ts` is unchanged.
- [x] Step 4: Run the checks in Verification.

## Verification
- `docker compose config` shows the `api` healthcheck invoking `ping_database` and shows `frontend` waiting on `service_healthy`.
- Start the stack against a reachable PostgreSQL and confirm `api` becomes healthy before `frontend` is started.
- Point `DATABASE_PORT` at a closed port, run the healthcheck command once, and confirm a non-zero exit. Do not leave that port in `.env`.
- Search `apps/api/src/vetdietderm_api/main.py` and confirm no route was added for the probe.
