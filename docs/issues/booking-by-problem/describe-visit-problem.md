---
source_prd: docs/prd/2026-11-07_booking-by-problem_prd.md
prd_id: 2026-11-07-booking-by-problem
cycle_id: 2026-11-07-booking-by-problem
cycle_slug: booking-by-problem
project_doc: docs/PROJECT.md
status: Done
---

# Owner Describes the Problem

## Implementation Status
Status: Done

## Description
A new owner visit request is the pet, a required problem text, the proposed time, optional files, and the clinic's one optional questionnaire. The owner does not choose a visit type or a specialty. The problem text is the request label. Already submitted requests keep their stored type, answers, and files.

## Requirements
- `VisitCreate` requires `reason` after whitespace stripping, with length 1–4000. A missing, blank, or whitespace-only problem is rejected with 422. `visit_type` is not a field on `VisitCreate`; `extra="forbid"` rejects a client that still sends it. No specialty field is added to the request.
- New `visit_requests.visit_type` values are SQL NULL. Migration `0039_owner_problem_request` only drops the NOT NULL constraint. It does not rewrite `visit_type`, `answers`, or `visit_request_files` on existing rows.
- `VisitRead.visit_type` is optional. Owner and staff responses still return the stored type for rows that have one, and `null` for a new request.
- The owner cabinet labels every request with the stored problem text. Home current consultation, upcoming rows, and the visit card title use that text. When a historical row has no problem text, the label is `Заявка`. Those surfaces do not substitute `VISIT_TYPE_LABELS`.
- The booking form keeps four steps. Step 1 is the pet and a required problem textarea (`maxLength` 4000). The visit-type select and the four type buttons are removed. Step 2 still shows the questionnaire, including when the list is empty, and says that every question is optional. Continuing with no answers is valid. Step 3 remains the proposed time and optional files. Step 4 reviews the pet, problem text, time, and only the questions that have answers. File rules stay 8 MiB and JPEG, PNG, WebP, GIF, or PDF.
- The clinic has one published questionnaire. Selection among existing clinic rows keeps `visit_type = primary` when that row exists. Otherwise it keeps the row with the latest `updated_at`, and an equal timestamp keeps the greater questionnaire id. The other rows stay in the database, are absent from `GET /visit-questionnaires` and from the owner question read, and cannot be replaced. Replacing the kept list, including with an empty question list, does not insert an encounter and does not change `visit_requests.answers`.
- A clinic with no questionnaire row gets one new row stored as `visit_type = primary` on first staff list or owner question read. The other three types are not created.
- `GET /visit-questionnaires` returns a one-element list containing the kept row. `PUT /visit-questionnaires/{visit_type}` replaces that row only when the path matches its stored `visit_type`. Any other type returns 404 and does not insert a row. Owner and admin may replace it. Member and viewer receive the existing 403 `Анкету клиники изменяют владелец и администратор` on PUT and can still read the list.
- Owner questions move to `GET /owner/visit-questions` with no visit type. Remove `GET /owner/visit-questions/{visit_type}`. The owner client loads that single list.
- An answer snapshot stores only questions the owner answered, each with question id, label, kind, value, and the select options captured at submission. Omitted questions, whitespace-only text, and an empty multi-select are not stored. `0` remains a stored number. Unknown question ids, duplicate ids, and a present but invalid value still return 422. An empty `answers` array is valid while the clinic has published questions.
- Until `classify-confirmed-visit` accepts a type on confirmation, `confirm` of a request whose `visit_type` is NULL returns 422 `Укажите тип визита` and does not insert an appointment. Confirmation of a request that already has a stored type keeps using that type.
- Staff queue rows in `Запросы визитов` show the problem text as the request line, or `Заявка` when it is absent. They do not show a visit-type name as that line.
- Settings copy describes one clinic questionnaire and says that answers are optional. It does not render four type editors.
- Update the visit-request and questionnaire sentences in `docs/PROJECT.md` so they describe one optional clinic questionnaire and a required problem text. Leave the charge and confirmation-classification sentences to their own issues.

## Acceptance Criteria
- `POST /owner/animals/{animal_id}/visits` with a non-blank problem, a proposed time, and `answers: []` returns 201. The stored `visit_type` is null, and the owner list label is the problem text.
- The same call with `reason` missing, `""`, or `"   "` returns 422 and inserts no row. A problem of 4000 characters succeeds. 4001 characters fails. A body that includes `visit_type` or `specialty` returns 422.
- With published questions, a request that answers one question stores a one-element snapshot with that question's id, label, kind, value, and options. A request that answers none stores `[]`. A whitespace text answer is omitted. An unknown id, a duplicate id, or an invalid select value returns 422.
- After the clinic replaces or empties the kept questionnaire, a previously stored snapshot is unchanged and no encounter row is created.
- A clinic that has `primary` plus other types exposes only the `primary` list on staff GET and owner GET. PUT of `secondary`, `consultation`, or `supervision` returns 404 and leaves those rows unchanged. A clinic with no `primary` row exposes the newest other row, with the greater id winning an equal `updated_at`.
- Owner and admin can save the kept list. A member and a viewer can load it and receive 403 on PUT.
- The owner form has no visit-type control. The questionnaire step is visible and can be continued while blank. The review step shows the problem text.
- Existing requests still return their previous `visit_type`, answers, and files. Their owner-facing title is the problem text, or `Заявка` when `reason` is null, never the visit-type name.
- Confirming a new null-type request before the classification issue returns 422 and creates no appointment. Confirming an older request that already has a type still creates the appointment with that type.

## Dependencies
None. Owner visit requests, clinic questionnaires, and the owner cabinet already exist. Assumption: the single published list remains a `visit_questionnaires` row. Its stored `visit_type` is an internal key, not an owner choice. A clinic with no row is seeded as `primary` because that is the PRD's preferred list. `docs/issues/booking-by-problem/classify-confirmed-visit.md` later replaces the null-type confirmation 422 with the doctor's type.

## Files Likely Touched
- `apps/api/alembic/versions/0039_owner_problem_request.py`
- `apps/api/src/vetdietderm_api/visits/models.py`
- `apps/api/src/vetdietderm_api/visits/schemas.py`
- `apps/api/src/vetdietderm_api/visits/repository.py`
- `apps/api/src/vetdietderm_api/visits/router.py`
- `apps/api/src/vetdietderm_api/questionnaires/repository.py`
- `apps/api/src/vetdietderm_api/questionnaires/router.py`
- `packages/owner-features/src/api.ts`
- `packages/owner-features/src/components/visit-request-form.tsx`
- `apps/owner-web/src/visit-request-form.test.tsx`
- `apps/clinic-web/src/features/owner-cabinet/components/visit-questionnaire-editor.tsx`
- `apps/clinic-web/src/features/owner-cabinet/components/visit-request-queue.tsx`
- `apps/clinic-web/src/features/appointments/api.ts`
- `apps/clinic-web/src/app/_components/api-contract.test.ts`
- `apps/api/tests/test_visit_requests.py`
- `packages/api-contract/openapi.json`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Step 1: Add Alembic revision `0039_owner_problem_request` with `down_revision = "0038_clinic_invite_transfers"`, making `visit_requests.visit_type` nullable and leaving existing values in place. Map `VisitRequest.visit_type` as `str | None`.
- [x] Step 2: Make `VisitCreate.reason` required (`min_length=1`, `max_length=4000`) under the existing strip-whitespace config, and remove `visit_type` from `VisitCreate`. Make `VisitRead.visit_type` optional.
- [x] Step 3: In `visits/repository.py` `snapshot`, build the stored list from the published questions the owner actually answered. Skip missing ids, blank text, and empty multi-select. Reject unknown ids, duplicate ids, and invalid present values with the current 422 messages. Allow an empty result.
- [x] Step 4: In `create`, persist `visit_type=None` and the required `reason`. In `confirm`, when `row.visit_type` is None, raise 422 `Укажите тип визита` before inserting an appointment.
- [x] Step 5: Add `published_clinic_questionnaire` in `questionnaires/repository.py` using the primary-else-newest rule and the greater-id tie-break. Stop `list_questionnaires` from calling `ensure_clinic_slot` for every `VisitType`. Return and, when the clinic has no row, create only the kept `primary` slot.
- [x] Step 6: Limit `replace_questionnaire` to the kept row. Return 404 for every other visit type without inserting a questionnaire or touching `visit_requests` or encounters. Keep the owner/admin PUT guard.
- [x] Step 7: Replace `GET /owner/visit-questions/{visit_type}` with `GET /owner/visit-questions`, reading the kept clinic list. Point `ownerVisits.questions` at that path and stop sending `visit_type` from `ownerVisits.create`.
- [x] Step 8: Run `pnpm api:generate` so `@vetdietderm/api-contract` matches the Pydantic models.
- [x] Step 9: Rebuild `VisitRequestForm`: required problem textarea, no type control, optional questionnaire step, review that shows the problem and answered questions only. Label owner visit titles from `reason`, falling back to `Заявка`. Update the empty-state sentence that still tells the owner to choose a visit type.
- [x] Step 10: Render one questionnaire editor in clinic settings, titled `Анкета перед визитом`, with copy that answers are optional. Show the problem text, or `Заявка`, on each staff queue row instead of `VISIT_TYPE_LABELS`.
- [x] Step 11: Update `docs/PROJECT.md` current-functionality sentences for the owner request and the clinic questionnaire to this behavior.
- [x] Step 12: Update existing visit-request and form tests that still require a type and a complete answer set, then run the checks in Verification.

## Verification
- Create a request with a problem and no answers. Read it back as the owner and as staff: `visit_type` is null, the label is the problem, and files still upload under the 8 MiB JPEG/PNG/WebP/GIF/PDF rules.
- Repeat with whitespace, 4000 characters, 4001 characters, a foreign `visit_type`, one valid answer, one blank answer, and one invalid answer.
- Seed two clinic lists and confirm only the PRD winner is readable and writable. Save an empty replacement and confirm an older snapshot is unchanged.
- Sign in as member and as viewer: the settings list loads and PUT returns 403. Sign in as admin: PUT of the kept type succeeds.
- Open the owner booking form and the staff queue and confirm there is no type choice and no type title.
- Run `uv run --directory apps/api python -m py_compile src/vetdietderm_api/visits/repository.py src/vetdietderm_api/questionnaires/repository.py`.
- Run `pnpm api:check`.
- Run the updated `apps/api/tests/test_visit_requests.py` and `apps/owner-web/src/visit-request-form.test.tsx` cases for this contract.


## Verification Results — 2026-11-07
- API: 31 passed, 1 skipped. Command: uv run --directory apps/api --cache-dir F:/Projects/vetapp/.tmp/uv-cache python -m pytest tests/test_visit_requests.py -q -rs. TestClient required execution outside the Windows sandbox because its local socketpair blocks inside it.
- Covered: required/trimmed reason and 4000/4001 bounds; forbidden type/specialty; null stored type and confirmation refusal without acceptance or appointment; empty/partial snapshots, numeric zero, blank omissions and invalid/duplicate ids; primary/newest/id selection; hidden lists retained; owner/admin PUT and member/viewer GET/403; empty-clinic single-row seeding and wrong-type PUT without insertion; legacy confirmation and file boundaries.
- Owner form: 8 passed. Command from apps/owner-web: npm exec -- vitest run src/visit-request-form.test.tsx --maxWorkers=1. Covers four steps, no type control, blank/partial questionnaire, review, title fallback and upload retries.
- Staff generated-client contract: 2 passed. Command from apps/clinic-web: npm exec -- vitest run src/app/_components/api-contract.test.ts --maxWorkers=1.
- Both apps: TypeScript passed. Owner lint and targeted clinic component lint passed. Python repository compilation passed.
- Generated contract: npm --prefix packages/api-contract run generate and npm --prefix packages/api-contract run check:generated passed. Equivalent existing npm scripts were used because Corepack could not download the pinned pnpm version (registry.npmjs.org DNS unavailable).
- Migration offline SQL passed: upgrade from 0038 to 0039 emits only DROP NOT NULL on visit_requests.visit_type plus Alembic bookkeeping. No migration was applied to a live database.
- Skip: concurrent publication integration check could not create an isolated PostgreSQL schema (OperationalError). SQLite API checks passed.
- Live browser walkthrough was not run; the owner flow was exercised through rendered component tests, and staff settings/queue were checked by source inspection and API role/contract checks.
- Cycle remains In Progress: classify-confirmed-visit and post-visit-charge are Not Started. Null-type confirmation intentionally returns 422 until the classification issue.
