---
source_prd: docs/prd/2026-10-27_owner-cabinet_prd.md
prd_id: 2026-10-27-owner-cabinet
cycle_id: 2026-10-27-owner-cabinet
cycle_slug: owner-cabinet
project_doc: docs/PROJECT.md
status: Not Started
---

# Registration Acceptance

## Implementation Status
Status: Not Started

## Description
A clinician accepts a pending owner registration into the workspace that issued the join code, either as a new client or linked to an existing client. Pending animals stay out of the patient list until that accept. After the link, the owner sees every animal on that client as a passport and can add another animal straight onto the list. Confirming a visit is a later issue; this issue leaves one accept function that later issue can call.

## Requirements
- A `pending` registration does not appear in `GET /patients`, `GET /clients`, or the patient search box. It appears in a registration queue on `/patients`, separate from the main list.
- The queue shows the owner's name, email, and phone, the doctor label, the workspace (personal practice or organization name), and each pending animal's passport (name, species, breed, sex, birth date).
- Organization observers (`org_role` outside `owner`, `admin`, and `member`) can open the queue and cannot accept. Members who can edit clinical records can accept an organization-code registration for that organization. A personal-code registration can be accepted only by that code's doctor, in that personal workspace.
- Accept writes `clients` and `patients` into the code's workspace, not into whichever workspace header the clinician happens to have selected. Personal rows keep `tenant_id` null and `created_by` equal to the inviting doctor. Organization rows use that organization's `tenant_id` and the same isolation rules as other clinical records.
- Accept offers two choices. Create a new client from the owner's current name, email, and phone, and create one patient per pending animal using only the passport fields (clinical fields empty, sex copied, weight null). Or link an existing client in the code's workspace. Email, phone, and name do not select that client automatically. The clinician picks the client.
- For a linked client, each pending animal is either matched to one existing patient of that client or kept as an additional patient of that client. Matching updates only that patient's passport fields and leaves weight, allergies, chronic conditions, feeding notes, and every other clinical field as they were. One existing patient cannot be chosen for two pending animals in the same accept.
- Accept covers the owner and every animal still on that registration. Status becomes `accepted`, and `client_uuid` points at the created or linked client. A second accept of the same registration returns 409.
- An animal the owner adds after acceptance is created immediately as a `patients` row for that client in the code's workspace and shows up in the main patient list and search. An animal added while the registration is still pending stays on `owner_animals` and off the main list.
- Until `client_uuid` is set, `GET /owner/animals` returns only the owner's pending animals. After it is set, that list returns every patient of that client as a passport. The owner can edit passport fields on each of them through the same five-field write model. The owner still cannot see clinical fields, encounters, diet plans, the communication log, or unshared files.
- When a link exists, `PATCH /owner/me` also updates that client's `name`, `email`, and `phone`. Before a link, it still updates only the owner account.
- The clinician can still create a client and a patient with the existing forms when no owner account is involved. Those records are not forced into the queue.
- This issue does not implement visit requests. Put the link-or-create rules in one function, `accept_registration(session, registration_id, payload)`, so a later visit-confirmation issue can accept the same registration by calling it. Do not add visit rows to the queue.
- Russian UI. Observers see the queue without an Accept action.

## Acceptance Criteria
- A pending owner and their animals are visible in the `/patients` registration queue and absent from the main patient list and from search by animal name and owner name.
- An organization observer can read the queue. Submitting accept returns 403 and leaves the registration `pending`.
- Accept as a new client creates the client and one patient per pending animal in the code's workspace. Those patients then appear in the main list and search. The registration is `accepted`.
- Accept by linking an existing client, with one animal matched and one kept as new, updates the matched patient's passport only, creates one additional patient, and does not duplicate the matched patient. Clinical fields on the matched patient stay as they were.
- Choosing the same existing patient for two pending animals is rejected, and the registration stays `pending`.
- After accept, the owner sees every animal on that client, including a patient the clinician had already created on that client, as passport fields only. Editing sex on one of them updates the patient card the clinician sees and does not change weight or feeding notes.
- An animal added by the owner after accept appears in clinician search without another accept. An animal added by a different owner who is still pending does not.
- Changing the owner's phone after accept changes the linked client's phone. The same change before accept does not create or edit a client.
- Creating a client and patient from the existing clinician forms still works and does not require an owner account.
- Accepting a personal-code registration while the caller's workspace is the doctor's organization still writes personal rows (`tenant_id` null, `created_by` the inviting doctor). A different doctor cannot accept that personal registration.

## Dependencies
- `docs/issues/owner-cabinet/join-the-doctor.md` must be Done. It supplies the owner account, join-code workspace, and `pending` registration.
- `docs/issues/owner-cabinet/owner-animals.md` must be Done. It supplies `owner_animals`, `patients.sex`, and the owner passport API this issue extends.
- Existing tenancy in `apps/api/src/vetdietderm_api/tenancy.py` and client/patient search in `apps/api/src/vetdietderm_api/patients/repository.py`.
- The later visit-request feature will call `accept_registration` when the clinician confirms that owner's first visit. That feature is not part of this issue. The combined queue that also lists visit requests is a later feature; this issue adds registration rows only.

## Files Likely Touched
- `apps/api/alembic/versions/0025_registration_acceptance.py`
- `apps/api/src/vetdietderm_api/owners/models.py`
- `apps/api/src/vetdietderm_api/owners/schemas.py`
- `apps/api/src/vetdietderm_api/owners/repository.py`
- `apps/api/src/vetdietderm_api/owners/router.py`
- `apps/api/src/vetdietderm_api/patients/repository.py`
- `frontend/src/components/modules/patients.tsx`
- `frontend/src/components/owner/registration-queue.tsx`
- `frontend/src/components/owner/cabinet-home.tsx`
- `frontend/src/components/owner/animal-form.tsx`
- `frontend/src/lib/owner-api.ts`
- `frontend/src/lib/api-client.ts`
- `frontend/src/lib/hooks.ts`
- `docs/PROJECT.md`

## Implementation Steps
- [ ] Add Alembic `0025_registration_acceptance` (down revision `0024_animal_sex`). Add nullable `owner_registrations.client_uuid` foreign key to `clients.uuid` `ON DELETE RESTRICT`, plus nullable `accepted_at`. Add nullable `owner_animals.patient_uuid` foreign key to `patients.uuid` `ON DELETE SET NULL`.
- [ ] Add `GET /owner-registrations` under clinical access. Return pending registrations visible in the caller's current workspace: personal rows for the signed-in doctor, organization rows for that organization. Include owner contact, doctor label, and animal passports. Do not include visit requests.
- [ ] Implement `accept_registration` and `POST /owner-registrations/{id}/accept` with body `{ mode: "create" | "link", client_uuid: uuid | null, matches: [{ owner_animal_id, patient_uuid | null }] }`. Enforce the caller rules, the code's workspace on inserted rows, unique patient matches, and the passport-only update when `patient_uuid` is set. Set `owner_animals.patient_uuid`, `owner_registrations.client_uuid`, `status=accepted`, and `accepted_at`. Return 409 when the registration is already accepted. Return 403 for an observer or for a doctor who does not own a personal code.
- [ ] When the owner's registration is accepted, change `POST /owner/animals` to create a `patients` row on the linked client in the code's workspace and return that passport. Change `GET /owner/animals` to list every patient of `client_uuid` as a passport. Change `PATCH /owner/animals/{id}` so `{id}` is a patient id of that client and the write touches only name, species, breed, sex, and birth date. When the registration is still pending, keep the owner-animal behavior from the previous issue.
- [ ] Extend `PATCH /owner/me` so that, once `client_uuid` is set, the same name, email, and phone are written to that `clients` row inside the code's workspace.
- [ ] On `/patients`, render the registration queue apart from the searchable list. For each pending registration, let an editor choose «Новый клиент» or an existing client from that workspace, then for each animal choose an existing patient of that client or «Отдельный пациент», and submit Accept. Hide Accept for an organization observer. Do not place pending animals in the main search results.
- [ ] Update `docs/PROJECT.md`: a registration stays off the patient list until accept; after accept the owner sees that client's animals as passports; a clinician can still create a client and patient with no owner account.
- [ ] Run the verification checks below.

## Verification
- Create an owner, add two animals, and confirm they show in the queue and not in patient search.
- As an organization observer, open the queue and confirm Accept is absent. Call the accept endpoint and confirm 403 with the registration still `pending`.
- As an editor, accept with a new client. Confirm the client contact matches the owner, both animals are patients in the code's workspace, and search finds them.
- On a second registration, link an existing client, match one animal to an existing patient, and keep the other as a new patient. Confirm the matched patient's weight and feeding notes are unchanged, its passport matches the owner's animal, and only one new patient was created.
- Submit two matches that name the same `patient_uuid` and confirm the call fails and the registration stays `pending`.
- After a successful link, sign in as the owner and confirm the list includes a patient that clinician had created earlier on that client. Confirm the payload has no clinical fields. Edit sex and confirm the clinician card updates while weight stays put.
- Add an animal after accept and confirm it appears in clinician search without a second accept.
- Edit the owner phone before accept on a still-pending account and confirm no client row changes. Edit it after accept and confirm the linked client's phone changes.
- Create a client and patient from the existing clinician forms with no owner and confirm they save and appear on the main list.
- Accept a personal-code registration and confirm the new client has `tenant_id` null and `created_by` equal to the inviting doctor, including when the request's workspace header is `organization`.
- From `frontend/`, run `npm run check`. From `apps/api/`, run `uv run python -c "from vetdietderm_api.main import app"`.
