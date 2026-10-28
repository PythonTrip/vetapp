---
source_prd: docs/prd/2026-10-27_owner-cabinet_prd.md
prd_id: 2026-10-27-owner-cabinet
cycle_id: 2026-10-27-owner-cabinet
cycle_slug: owner-cabinet
project_doc: docs/PROJECT.md
status: Done
---

# Owner Animals

## Implementation Status
Status: Done

## Description
The owner registers and edits animal passports on the cabinet. Name and species are required. Breed, sex, and birth date are part of the passport. Until a clinician accepts the registration, those animals stay off the patient list. The clinician passport gains the same sex field. Clinical fields stay hidden from the owner.

## Requirements
- Sex is `male`, `female`, or `unspecified`. Species stays `dog`, `cat`, or `other`. Breed may be empty. Birth date may be empty. Name and species are required.
- Before acceptance, the owner creates and edits animals on the pending registration from join-the-doctor. Those rows are not `patients` and do not appear in `GET /patients`, `GET /clients`, or patient search.
- The owner passport payload is only `name`, `species`, `breed`, `sex`, and `birth_date`. Responses for the owner omit weight, expected adult weight, life stage, activity, neuter, pregnancy, lactation, litter size, BCS, allergies, chronic conditions, feeding notes, diagnoses, encounters, diet plans, and communications.
- The owner can edit those five passport fields. The owner cannot delete an animal, a client, or a file.
- `patients.sex` exists for every patient, default `unspecified`. The clinician sees it on the patient card and can edit it in the existing patient form. Creating a patient from the clinician workspace still works when sex is omitted; the stored value is `unspecified`.
- Russian labels: `male` — «Самец», `female` — «Самка», `unspecified` — «Не указан». Species labels stay «Собака», «Кошка», «Другое».
- The cabinet animal list is empty until the owner adds an animal. The doctor block from join-the-doctor stays visible. This issue does not add chat, visit requests, questionnaires, or file download.
- After this issue, animals added before acceptance remain pending. Promoting them to `patients`, showing the rest of a linked client's animals, and creating patients directly after acceptance belong to registration acceptance.
- The cabinet animal screens stay a single column usable at 390px width.

## Acceptance Criteria
- A signed-in owner can add an animal with name and species only, and with breed, sex, and birth date filled in. The cabinet lists those animals and no clinical fields.
- Saving an edit changes only the passport fields the owner submitted. A request that includes `body_weight_kg`, `allergies`, `feeding_notes`, or `chronic_conditions` does not persist those values and does not return them.
- `GET /patients` and patient search, as the inviting doctor, do not return an animal that exists only on a pending registration.
- The clinician patient card shows sex. Editing sex to `male`, `female`, or `unspecified` persists. A new clinician-created patient with no sex stores `unspecified`.
- Existing clinician create and edit of weight, allergies, chronic conditions, and feeding notes still save on the patient the clinician opened.
- The owner has no delete control for an animal.

## Dependencies
- `docs/issues/owner-cabinet/join-the-doctor.md` must be Done. This issue attaches animals to the `pending` `owner_registrations` row and the owner session created there.
- Existing patient stack: `apps/api/src/vetdietderm_api/patients/models.py`, `schemas.py`, `router.py`, `repository.py`, `frontend/src/lib/patient-form.ts`, `frontend/src/components/patients/form-fields.tsx`, `frontend/src/components/modules/patient-detail.tsx`.

## Files Likely Touched
- `apps/api/alembic/versions/0024_animal_sex.py`
- `apps/api/src/vetdietderm_api/owners/models.py`
- `apps/api/src/vetdietderm_api/owners/schemas.py`
- `apps/api/src/vetdietderm_api/owners/repository.py`
- `apps/api/src/vetdietderm_api/owners/router.py`
- `apps/api/src/vetdietderm_api/patients/models.py`
- `apps/api/src/vetdietderm_api/patients/schemas.py`
- `frontend/src/lib/api-client.ts`
- `frontend/src/lib/patient-form.ts`
- `frontend/src/components/patients/form-fields.tsx`
- `frontend/src/components/modules/patient-detail.tsx`
- `frontend/src/components/owner/cabinet-home.tsx`
- `frontend/src/components/owner/animal-form.tsx`
- `frontend/src/lib/owner-api.ts`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Add Alembic `0024_animal_sex` (down revision `0023_owner_join`). Add `patients.sex` `String(16)` not null, server default `unspecified`. Add `owner_animals` with `uuid`, `registration_uuid` foreign key to `owner_registrations.uuid`, `name`, `species`, `breed` default `''`, `sex` default `unspecified`, nullable `birth_date`, and timestamps. Do not add a `patients` foreign key in this issue.
- [x] Extend `Patient`, `PatientCreate`, `PatientUpdate`, and `PatientRead` with `sex` using a `StrEnum` of `male`, `female`, and `unspecified`. Default create and omitted update leave the stored sex as `unspecified` or unchanged.
- [x] Add owner routes on the owner session: `GET /owner/animals`, `POST /owner/animals`, and `PATCH /owner/animals/{animal_id}`. List and mutate only animals on the signed-in owner's registration. Reject another owner's id with 404. The write model accepts only name, species, breed, sex, and birth date. Ignore clinical keys if a client sends them. Return the passport fields only.
- [x] On the cabinet, under the existing doctor block, list the owner's animals and provide add and edit forms with the five passport fields. Require name and species. Use the Russian sex and species labels. Do not add a delete button. Keep one column at 390px width.
- [x] Add sex to `PatientRecord`, `PatientWrite`, `PatientFormValues`, `emptyPatientForm`, `patientToForm`, and `formToPatientPayload`. Add the sex select to `PatientFormFields` and show the label on the read-only patient card in `patient-detail.tsx`.
- [x] Note in `docs/PROJECT.md` that the patient passport includes sex and that owner-registered animals stay off the patient list until acceptance.
- [x] Run the verification checks below.

## Verification
- As an owner with no animals, confirm `/cabinet` still shows the doctor and an empty animal list. Add one animal with name and species, then a second with breed, sex, and birth date. Edit the first animal's sex and birth date and confirm the list updates.
- As that owner, submit a write body that also contains `allergies` and `body_weight_kg`. Confirm the stored passport is unchanged aside from the allowed fields and the response has no clinical keys.
- As the inviting clinician, search patients for that animal's name and confirm it is absent. Confirm `GET /patients` does not include it.
- As the clinician, open an existing patient, set sex to «Самка», save, reload, and confirm the card shows it. Create a patient without sex and confirm the stored value is `unspecified`.
- Change weight and feeding notes on that clinician-created patient and confirm they still save.
- From `frontend/`, run `npm run check`. From `apps/api/`, run `uv run python -c "from vetdietderm_api.main import app"`.


## Verification Results
- PASS: npm run check; API import; 14 owner/auth/API-access tests including isolated PostgreSQL integration; 6 frontend auth/surface tests.
- PASS: both migrations upgraded, downgraded to 0022 and reapplied in an isolated PostgreSQL schema. The working schema was not migrated.
- PASS: browser at 390px showed the doctor and empty animals, saved a minimal passport, edited breed/sex/birth date and retained the values after reload. No clinical fields or delete action were shown.
- PASS: API tests cover two animals, ignored clinical keys, foreign-owner 404, absence from clinician patient/client search, all sex values and preservation of weight, allergies, chronic conditions and feeding notes.
- SKIP: clinician sex editing in a real module-auth browser session; covered through clinical API create/PATCH/reload and frontend type/lint checks. QA browser used a deterministic staff authority. Owner/clinician production accounts were not used.
- Temporary QA servers stopped and isolated QA schema removed. Screenshot: .tmp/owner-cabinet-mobile.jpg.
