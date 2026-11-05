---
source_prd: docs/prd/2026-11-03_clinic-bot_prd.md
prd_id: 2026-11-03-clinic-bot
cycle_id: 2026-11-03-clinic-bot
cycle_slug: clinic-bot
project_doc: docs/PROJECT.md
status: Done
---

# Recover Clinic Transfers After Invite Acceptance

## Implementation Status
Status: Done

## Description
Review finding P1: `accept_clinic_invite` accepts the upstream invite and closes the source organization before refreshing the session and moving local records. If refresh fails, the invite is consumed but reusable records remain inaccessible under the closed clinic, and its bot and public link remain stored. A retry starts with the consumed invite and cannot finish. This repairs the PRD's Joining another doctor's clinic transfer guarantee.

## Requirements
- Record durable transfer progress tied to the authenticated invitee and source clinic before irreversible upstream operations. Store a verified destination when available and retain enough state to recover when acceptance succeeds but its response is lost.
- Separate upstream invite acceptance, source closure, local record migration, and cleanup into resumable phases. Do not assume cross-service database atomicity.
- Retry completion independently of re-accepting a consumed invite. A repeated authenticated request or the next authenticated session recovery must resume the existing transfer, including after process restart.
- Preserve existing emptiness and source-close authority checks. Before moving records, verify the destination from authoritative membership data; never trust a client-supplied destination tenant.
- Move the invitee's reusable templates, catalog items, and patient-less plans exactly once. Preserve shipped standard templates and destination-clinic records.
- Remove the closed source clinic's bot credential and public link after successful transfer completion, retaining the destination's bot and link.
- On refresh, upstream, or local-commit failure, preserve progress and expose a retryable error without reporting success. Recovery must not require secret or token values in logs or transfer records.

## Acceptance Criteria
- Invite acceptance followed by source closure and a failed forced refresh can recover after restart without accepting the invite again; all reusable rows reach the verified destination.
- A lost acceptance response can be reconciled against authoritative state without consuming a second invite or moving rows to an unverified clinic.
- A failed source-close call or local commit leaves a resumable transfer; retry completes without duplicate moves or deletion of destination resources.
- A completed transfer is idempotent on repeated requests and removes the source bot and public link.
- A different user cannot resume or redirect another user's transfer. A changed or missing destination membership prevents migration until reconciled.
- Populated-clinic refusal still occurs before invite acceptance, with both clinics unchanged.

## Dependencies
None. Existing module-auth invite, membership, and organization-close APIs are integration prerequisites. Inspect their response and retry semantics before defining phases. Coordinate shared `auth.py` edits with `refuse-invites-with-personal-records.md`; no functional ordering is required.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/auth.py` (includes `BrowserSession`, the existing local auth persistence model)
- `apps/api/src/vetdietderm_api/tenancy.py`
- `apps/api/alembic/versions/` (new revision for durable progress if required)
- `apps/api/tests/test_multi_user_auth.py`

## Implementation Steps
- [x] Step 1: Inspect module-auth accept, membership refresh, and organization-close semantics plus current local auth persistence; identify recoverable evidence for each upstream operation.
- [x] Step 2: Add durable transfer progress and its migration with source, authenticated invitee, verified destination, and resumable phase; exclude credentials and invite secrets.
- [x] Step 3: Refactor acceptance to persist progress before upstream mutations and reconcile ambiguous outcomes from authoritative state.
- [x] Step 4: Wire authenticated retries or session recovery to finish migration and cleanup without consuming the invite again.
- [x] Step 5: Make local migration and completion atomic and idempotent, retaining incomplete progress on failures.
- [x] Step 6: Verify refresh failure, lost upstream responses, close failure, local commit failure, process restart, unauthorized resume, and successful repeated completion.

## Verification
- With isolated persistence and controlled upstream responses, fail forced refresh after successful acceptance and source closure; restart the application flow and verify recovery without a second accept call.
- Inject lost acceptance responses, source-close errors, and local commit failures separately; inspect progress state and retry to completion, checking record counts, scope, bot deletion, and source-link removal.
- Exercise recovery as another user and with mismatched destination membership; confirm no record movement.
- Run `uv run --directory apps/api python -m py_compile src/vetdietderm_api/auth.py src/vetdietderm_api/tenancy.py` and, if a migration is added, apply it to an isolated database and verify progress survives a new session.

## Implementation Evidence
- Added revision `0038_clinic_invite_transfers`. Progress stores the authenticated user, source clinic, pre-accept membership IDs, verified destination, phase, and a one-way invite digest for idempotency. Raw invite and session credentials are excluded.
- Phases are `accepting`, `accepted`, `closing`, `closed`, and `done`. An invitee/provisioning advisory lock serializes the workflow across API processes. Progress commits precede remote mutations; reusable-row moves, source bot/link cleanup, and `done` commit together.
- Repeated invite requests and `require_user` resume incomplete progress before clinic provisioning. An uncertain refresh may invalidate the browser session; re-login resumes the same durable transfer.
- Integration prerequisite: module-auth must support authenticated `GET /me/organizations` with current `organizations[].organization_id`, `status`, and `org_role`. Verified against the newer local module-auth API and schemas; the bundled integration skill describes an older contract. An unavailable membership endpoint refuses before accepting or closing anything.
- The accept response contains no destination ID. Recovery compares authoritative memberships against the saved baseline, pins exactly one new active membership, and rechecks it after source closure and forced refresh. Missing or ambiguous evidence returns 503 without re-accepting or redirecting the transfer.
- `uv run --cache-dir F:/Projects/vetapp/apps/api/.tmp/uv-cache --directory apps/api python -m pytest tests/test_multi_user_auth.py -q -o faulthandler_timeout=30`: 32 passed. Includes lost accept/close responses, close failure, refresh failure, final commit failure, fresh app/session recovery through both routes, authorization, destination validation, populated-clinic refusal, and pre-accept persistence failure.
- The new migration was applied and rolled back on an isolated SQLite database. Progress survived disposal of the original engine and reopening through a new session.
- Python compilation passed for `auth.py`, `tenancy.py`, and the new migration. FastAPI TestClient tests ran outside the sandbox because its Windows loopback socket restriction blocks asyncio startup. The global uv cache was inaccessible, so checks used the workspace cache.
- Live module-auth integration and PostgreSQL advisory-lock contention were not run: verification used controlled authority responses and isolated SQLite persistence. Deploy revision `0038` with the membership endpoint prerequisite. Clinic Bot remains In Progress while its other issues are open.
