---
source_prd: docs/prd/2026-10-27_owner-cabinet_prd.md
prd_id: 2026-10-27-owner-cabinet
cycle_id: 2026-10-27-owner-cabinet
cycle_slug: owner-cabinet
project_doc: docs/PROJECT.md
status: Done
---

# Visit Questionnaires

## Implementation Status
Status: Done

## Description
The inviting doctor keeps one published questionnaire per bookable visit type and is the only person who edits it. Questions use the same answer kinds as anamnesis. A questionnaire is not an encounter template and does not create a draft encounter. Replacing it leaves answers that were already submitted untouched. Those submitted answers arrive with the visit-request issue.

## Requirements
- The four bookable types are `primary` («Первичный»), `secondary` («Повторный»), `consultation` («Консультация»), and `supervision` («Курирование»). Each signed-in doctor has one questionnaire per type, keyed by that doctor's `user_id` from `GET /me`. Another doctor does not see or edit it.
- Question kinds are `binary`, `single_select`, `multi_select`, `number`, `text`, and `date`. `binary` is yes/no and has no option list. `single_select` and `multi_select` require at least two options, each with a `value` and a Russian `label`. Every stored question has a non-empty label of at most 500 characters.
- Saving a type replaces that doctor's current question list for that type in one request. Position is the submitted order, starting at 0. A save with an empty list is a published questionnaire with no questions. The visit-request issue treats that empty list as no questionnaire.
- Replacement does not add a column or a job that rewrites later visit answers. This issue stores no answers. Question rows may be deleted and recreated on save; a future answer snapshot must copy the label, kind, and value at submit time rather than point at a live question row.
- The editor does not write `encounters`, `encounter_templates`, or `clinical_catalog_items`.
- Russian UI on `/settings`, next to the existing join-code card. Four type sections, each with add, reorder, remove, and save. Show a saved empty type as «Анкета не задана — запрос уйдёт без вопросов».
- Only a staff session can call the editor routes. An owner session receives 401.

## Acceptance Criteria
- The signed-in doctor saves two questions on «Первичный» and sees them after reload, in the same order. A second staff account does not see that list on their own settings screen.
- Saving «Курирование» with zero questions persists an empty list. Reloading still shows the empty state.
- A `single_select` question with one option is rejected. A question with a blank label is rejected.
- Saving a changed «Первичный» list does not create an encounter. The previous question ids may disappear; nothing in `encounters` changes.
- The owner cookie cannot `GET` or `PUT` the editor routes.

## Dependencies
- Staff session and `/settings`: `apps/api/src/vetdietderm_api/auth.py`, `frontend/src/components/modules/settings.tsx`.
- No other new owner-cabinet issue. Visit request will read this doctor's published list; it is not part of this issue.

## Files Likely Touched
- `apps/api/alembic/versions/0028_visit_questionnaires.py`
- `apps/api/src/vetdietderm_api/questionnaires/models.py`
- `apps/api/src/vetdietderm_api/questionnaires/schemas.py`
- `apps/api/src/vetdietderm_api/questionnaires/repository.py`
- `apps/api/src/vetdietderm_api/questionnaires/router.py`
- `apps/api/src/vetdietderm_api/main.py`
- `frontend/src/components/owner/visit-questionnaire-editor.tsx`
- `frontend/src/components/modules/settings.tsx`
- `frontend/src/lib/api-client.ts`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Add Alembic `0028_visit_questionnaires` with `down_revision` set to the current head (`0027_owner_file_visibility` unless a newer revision is already head). Create `visit_questionnaires` (`uuid`, `doctor_user_id`, `visit_type`, timestamps) with a unique `(doctor_user_id, visit_type)`. Create `visit_questions` (`uuid`, `questionnaire_uuid` foreign key `ON DELETE CASCADE`, `position`, `kind`, `label`, `options` JSONB not null default `[]`). These tables are not `TenantOwned`.
- [x] Add Pydantic models for the four visit types and six question kinds. `GET /visit-questionnaires` returns the signed-in doctor's four slots, creating a missing slot as an empty question list. `PUT /visit-questionnaires/{visit_type}` replaces that slot's questions in the submitted order. Reject an unknown type, a select with fewer than two options, and a blank label. Protect both routes with `require_clinical_access`.
- [x] Register the router in `create_app` behind clinical access.
- [x] Add the Russian editor to `/settings` with the four type names, kind labels «Да/нет», «Один вариант», «Несколько вариантов», «Число», «Текст», and «Дата», and the empty-state sentence above.
- [x] Note in `docs/PROJECT.md` that the inviting doctor publishes one questionnaire per bookable visit type and that saving it does not create an encounter.
- [x] Run the verification checks below.

## Verification
- Sign in as a doctor, save a yes/no question and a single-choice question with two options on «Первичный», reload `/settings`, and confirm the order. Sign in as another doctor and confirm that screen does not list the first doctor's questions.
- Save «Курирование» with no questions and confirm the empty sentence remains after reload.
- Submit a single-choice question with one option and confirm the save is rejected and the stored list is unchanged.
- Confirm `encounters` gains no row from a save. Call `GET /visit-questionnaires` with only the owner cookie and confirm 401.
- From `frontend/`, run `npm run check`. From `apps/api/`, run `uv run python -c "from vetdietderm_api.main import app"`.


## Verification Results
- `frontend/`: `npm run check` passed (TypeScript and ESLint).
- `apps/api/`: `uv run python -c "from vetdietderm_api.main import app"` passed.
- `uv run alembic heads`: single head `0028_visit_questionnaires`. Offline upgrade SQL from `0027_owner_file_visibility` passed; new tables, unique constraints, JSONB default and cascading foreign key inspected.
- Isolated API walkthrough with the existing cabinet fixture passed: four persistent slots; saved questions and submitted order after reload; reorder/replacement; empty supervision; blank/overlong labels, one-option selects, duplicate option values and binary options rejected without changing stored questions; unknown type rejected; second doctor isolated; owner-cookie GET/PUT return 401; organization observer PUT returns 403. Counts of encounters, encounter templates and clinical catalog items remain unchanged.
- Existing regression suite: `uv run pytest tests/test_owner_cabinet.py -q` — 11 passed.
- Component smoke: `npm run test -- .tmp/visit-questionnaire.smoke.test.tsx` — 2 passed (add/select options/reorder/save, preserve draft after error, remove all/save empty, loading retry and observer controls). Local smoke scripts are ignored verification artifacts under `.tmp/`.
- Skipped: live PostgreSQL migration/concurrent-save walkthrough and authenticated browser reload/two-doctor screen checks. No isolated PostgreSQL service or authenticated browser session was provisioned for this run; API isolation and component interactions were verified separately. Apply migration `0028_visit_questionnaires` before using the editor on an existing database.
- Owner Cabinet cycle remains In Progress: visit-request and clinician-pending-list issues are not implemented by this issue.
