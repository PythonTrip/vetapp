# Integration test plan: API critical workflows

## Goal

Verify the deployed FastAPI contract across the real integration boundaries that carry the highest product risk: HTTP routing and validation, the instance-password gate, SQLAlchemy persistence in PostgreSQL, clinical entity relationships, disk-backed attachments, FEDIAF assessment, and immutable Diet Plan snapshots.

The test must detect failures that unit tests cannot: incorrect dependency wiring, serialization/lazy-loading errors, broken foreign-key relationships, commits that do not survive the next request, invalid HTTP status/detail contracts, attachment metadata diverging from file storage, and assessment results that cannot be persisted and read back.

## Environment and isolation

- Run through `fastapi.testclient.TestClient`; do not call repository functions as the behavior under test.
- Use the configured PostgreSQL server, not SQLite. The production models use JSONB and PostgreSQL-specific behavior.
- Create a unique schema named `it_api_<uuid>` for each test and make it the entire `search_path` (PostgreSQL system catalogs remain implicitly available).
- Build the current runtime ORM schema inside that unique schema, verify that every required table resolves there, and drop only that generated schema in teardown.
- Never include, read from, write to, or truncate `public` in a test connection.
- Point `ATTACHMENT_DIR` to pytest's per-test temporary directory.
- Use a known test-only bearer token through environment-backed settings and clear all settings/engine caches around each app instance.
- Seed only data that has no public write API (canonical Nutrient rows). Create all user-facing records through HTTP.

Alembic migration execution is intentionally outside this runtime suite. Migration `0019_archive_guideline_runtime_tables` contains explicit `public` references, so applying the migration chain with a changed `search_path` could mutate the developer schema. Migration verification requires a dedicated disposable database and should be a separate CI job.

## Contract matrix

### 1. Availability and access boundary

- `GET /health` succeeds without credentials and returns the exact status payload.
- Protected routes reject a missing or incorrect bearer token with `401`, the Russian error detail, and `WWW-Authenticate: Bearer`.
- `GET /ready` with the valid token performs a real `SELECT 1` against the isolated PostgreSQL connection and returns `200`.
- A representative route from every registered router is protected; OpenAPI itself remains available.

### 2. Clinical CRM workflow

Execute one connected workflow entirely over HTTP:

1. Create a Client, then create a Patient linked to it.
2. Confirm persistence and nested Client serialization through subsequent GET/search requests.
3. Create and update an Encounter with JSONB anamnesis, diagnoses, prescriptions, and VAS.
4. Create and update an Appointment linked to both Patient and Encounter; verify date filters.
5. Create and update a Communication; verify the server derives the Client relationship from the Patient.
6. Upload a PNG attachment linked to the Encounter, read metadata, download exact bytes/content type, update metadata, then delete it.
7. Confirm deleted resources return the documented `404` and the attachment file is removed from disk.

Include negative relationship checks: a resource that references an unknown Patient, or an Attachment that links an Encounter belonging to another Patient, must fail without leaving a database row or file behind.

### 3. Nutrition and snapshot workflow

1. Seed canonical Nutrients directly because the API intentionally exposes them read-only.
2. Create a Food through `POST /foods` and replace its nutrient values through the public endpoint.
3. Verify food search, detail serialization, category filters, nutrient list, and nutrient matrix output.
4. Call suggestions, energy estimate, and assessment for a realistic adult dog profile and the created ration.
5. Assert provenance (`standard_code`, edition/provider checksums), resolved context, deterministic input hash, energy completeness, row coverage, and overall verdict consistency.
6. Save a Diet Plan through HTTP, then list and read it in a later request.
7. Assert that the stored snapshot contains the original request, resolved context, provider identity, ration labels, and result hash.
8. Change the Food after saving and confirm the existing Diet Plan read remains unchanged; update the plan and confirm snapshot replacement is explicit and reproducible.

### 4. Validation and error semantics

- Invalid UUID/path and invalid Pydantic payloads return `422`.
- Unknown entities return `404` with the domain detail.
- Attachment type/size/VAS rules return `400`, `413`, or `422` as specified.
- Invalid catalog filter pairs and unknown nutrient codes return `422` without partial writes.
- Duplicate foods in an assessment ration return `422`.

## Assertion quality

- Assert status, headers, and meaningful response fields; do not snapshot entire volatile payloads such as UUIDs and timestamps.
- Parse every successful response into its public Pydantic response model where practical, so schema drift fails loudly.
- Compare UUID links across resources and exact persisted values across separate requests.
- For timestamps, require valid timezone-aware ISO-8601 values and ordering rather than exact clock values.
- For assessment numbers, assert documented invariants and stable provenance rather than duplicating the calculation engine in test code.
- No repository, storage, standard-provider, or database mocks. The only setup shortcut is direct insertion of read-only Nutrient reference rows.

## Test layout

- `apps/api/tests/integration/conftest.py`: isolated PostgreSQL schema, settings/cache reset, TestClient, attachment temp directory, canonical Nutrient seed, and safety assertions.
- `apps/api/tests/integration/test_api_access.py`: health/readiness/auth/OpenAPI boundary.
- `apps/api/tests/integration/test_clinical_workflow.py`: connected CRM and attachment lifecycle.
- `apps/api/tests/integration/test_nutrition_workflow.py`: catalog → assessment → immutable Diet Plan snapshot.

Mark tests with `pytest.mark.integration`. Register the marker in `pyproject.toml`. The suite should fail fast with an actionable message if PostgreSQL is unavailable or schema creation is not permitted.

## Execution and TDD sequence

1. Add the fixtures and the first access test; run it and record the expected red failure caused by missing integration wiring/marker.
2. Make only test-infrastructure changes required to reach green.
3. Add the CRM workflow, observe red, then correct test setup or production defects only when the failure proves a contract violation.
4. Add the nutrition workflow, observe red, then reach green without mocking the provider or repositories.
5. Run the integration marker alone, then the full existing pytest suite.

Commands:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m pytest -m integration -q
.\.venv\Scripts\python.exe -m pytest -q
```

## Exit criteria

- All three integration areas pass against PostgreSQL with isolated cleanup.
- No rows or files remain after teardown and no object was written to `public`.
- Existing tests remain green.
- Any production defect discovered is documented with the failing contract, fix, and regression assertion.
- Remaining risks (migration chain, live Uvicorn/socket behavior, reverse proxy/TLS, concurrency, and large-file load) are reported explicitly rather than implied covered.

## Execution result — 2026-09-01

- Integration suite: **3 passed**, 45 deselected, 140.73 s.
- Existing non-integration suite: **45 passed**, 3 deselected, 0.57 s.
- PostgreSQL isolation verified: every runtime table resolved to the generated schema; cleanup left **0** schemas matching `it_api_%`.
- Attachment isolation verified: rejected cross-Patient attachment produced no file; the valid upload round-tripped exact bytes and its delete removed both metadata and the physical file.
- Diet Plan isolation verified: renaming the current Food did not mutate the stored snapshot; explicit PATCH recalculated and replaced the snapshot with a new input hash.

The red phase found one production contract defect: after `PUT /foods/{food_id}/nutrient-values`, the response returned an empty `nutrient_values` array even though the rows had committed. SQLAlchemy reused the already-loaded empty relationship from the identity map. `get_food()` now reloads with `populate_existing=True`, and the integration test asserts both the immediate PUT response and a later GET.

One dependency warning remains: FastAPI's compatibility `TestClient` emits `StarletteDeprecationWarning` for the current `httpx` integration and recommends `httpx2`. It does not affect these results but should be handled during dependency maintenance.

Not covered by this run: Alembic on a disposable database, a live Uvicorn TCP process, proxy/TLS behavior, concurrent writes, and sustained/large-file load.
