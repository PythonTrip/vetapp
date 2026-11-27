# Shared API contract

FastAPI's `app.openapi()` is the source of truth. `packages/api-contract/openapi.json`
and `src/generated.ts` are committed build artifacts, never edited by hand.
The existing web API modules export aliases into these generated schemas. Local
form state and presentation helpers remain frontend types.

## Versioned public API

The initial `/v1` surface is additive. Existing URLs, cookies, success payloads,
CSRF requirements and legacy `{detail: ...}` errors continue to work. Neither
version redirects to the other; both invoke the same route handlers and
application services, repositories, authorization and transaction boundaries.
Clients can migrate one feature at a time, using the same session in both versions.

| Existing resource | Versioned resource | Identity |
| --- | --- | --- |
| `/clients`, `/patients`, `/encounters`, `/appointments` | `/v1/staff` + existing path | Staff |
| `/encounter-templates`, `/clinical-catalog` | `/v1/staff` + existing path | Staff |
| `/attachments`, `/foods`, `/nutrients`, `/guidelines`, `/assessments`, `/diet-plans` | `/v1/staff` + existing path | Staff |
| `/join-codes/current`, `/clinic-bot`, `/owner-registrations`, `/visit-questionnaires`, `/visit-requests` | `/v1/staff` + existing path | Staff |
| Patient/registration chat and nested clinical resources | `/v1/staff` + existing path | Staff |
| `/auth-service/auth/login`, `/logout`, `/refresh` | `/v1/auth/staff/login`, `/logout`, `/refresh` | Staff session for refresh |
| `/auth-service/auth/register`, `/email/*`, `/password/*` | `/v1/auth/staff/register`, `/email/*`, `/password/*` | Public onboarding/recovery |
| `/auth-service/me` (GET) | `/v1/auth/staff/me` | Staff |
| `/auth-service/organizations/{org_id}/members`, `/invites` (GET) | `/v1/staff/organizations/{org_id}/members`, `/invites` | Staff |

Methods, path/query parameters, request schemas and success status codes match
the original business endpoints. Staff login/register now explicitly declare
`{email, password}`. Staff refresh returns the profile, while tokens stay in the
BFF. Owner Cabinet routes, owner sessions and Telegram Mini App / Login Widget
auth were removed from the active runtime (archived on `archive/owner-cabinet`).
Public staff onboarding/recovery responses remain provider-owned JSON; the schema
does not promise fields the BFF does not validate. Downloads declare binary
responses and uploads declare multipart bodies.

This first migration intentionally exposes explicit auth operations rather than
the generic `/auth-service/{path}` proxy. Profile editing, password changes,
session management and organization mutations remain available at their existing
URLs; future `/v1` adapters should declare each operation individually. `/health`
and `/ready` keep their operational URLs. No legacy removal or deprecation date
is introduced.

`StaffSession` is the OpenAPI `apiKey` cookie scheme `vetapp_session`. Staff
authentication validates the active, verified account through module-auth,
including serialized refresh. There is no owner cookie scheme in the active API.
Staff workspace, organization roles, and super-admin catalog writes apply equally
to both URL versions.

Every `/v1` application error uses this shape (HTTP status remains meaningful):

```json
{"error":{"code":"forbidden","message":"Access denied","details":null}}
```

Common codes are `unauthenticated`, `forbidden`, `not_found`, `conflict`,
`validation_error`, `rate_limited`, `service_unavailable` and `internal_error`.
Validation details contain `loc`, `msg`, `type`, without submitted input or
credentials. Unexpected errors return a generic 500. Error responses have
`Cache-Control: no-store`; HTTP exception headers are preserved. Unknown `/v1`
paths and unsupported methods also use this envelope. Infrastructure/proxy
failures outside FastAPI may have their own format. The shared TypeScript client
supports both formats and exposes v1 `ApiError.code`, `message`, `details`, `status`.

New clients use the full versioned path with the API origin as base URL:

```ts
const questionnaires = dataOf(await staff.GET("/v1/staff/visit-questionnaires"));
```

`X-Vetapp-CSRF: 1` is required for mutations, including login/logout.
These headers, cookie identities, error models and operation IDs appear in
`/openapi.json` and `/docs`, and in the generated TypeScript contract.

## Several client applications

`FRONTEND_URL` keeps its existing meaning for the primary app and invitation
links. `API_ALLOWED_ORIGINS` adds browser origins to the same allowlist used by
CORS and CSRF, for example:

```dotenv
API_ALLOWED_ORIGINS=["https://clinic.example.com"]
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAMESITE=lax
```

Use exact scheme/host/port origins, without paths or wildcards. Existing local
origins remain available. Direct browser clients send `credentials: include`
and the CSRF header; the existing Next.js same-origin proxy and shared web client
continue to work with `/api/v1/...`. The Next.js proxy retains its own primary
origin check; additional apps access FastAPI directly or use their own proxy.
For cross-site browser clients use `AUTH_COOKIE_SAMESITE=none` with
`AUTH_COOKIE_SECURE=true`; settings reject an insecure `none` configuration.
Browser third-party-cookie restrictions can still require a same-site deployment
or an app-owned proxy. Defaults preserve the existing SameSite=lax behavior.
Native clients keep separate opaque-cookie storage per audience as described
below; this release adds no bearer-token protocol or mobile credential store.

## Reproduce and check

Prerequisites: Node 22+, pnpm from the root `packageManager`, uv and Python 3.13+.

```sh
pnpm install --frozen-lockfile
uv sync --directory apps/api --frozen --all-groups
pnpm api:generate
pnpm api:check
pnpm typecheck
pnpm test:web
```

The exporter constructs the actual application using inert settings, with no
`.env`, database, auth server, HTTP listener or migrations. It sorts JSON keys;
the generator and dependency versions are locked. `api:check` generates both
artifacts in memory and compares their contents (ignoring checkout CRLF). It
exits nonzero for a missing or stale artifact, including backend-only changes;
it never repairs files during CI. Commit both generated files with schema changes.
CI runs this check, client type tests, runtime tests and the web typecheck/build.

## Web: existing Next.js proxy

```ts
import { createApiClient, dataOf } from "@vetdietderm/api-client";

const staff = createApiClient({
  platform: "web",
  audience: "staff",
  workspace: () => "personal",
  auth: { audience: "staff" },
});
const slots = dataOf(await staff.GET("/visit-questionnaires"));
```

Web requests always use `/api` and `credentials: same-origin`. Cookies stay
HttpOnly; the client adds `X-Vetapp-CSRF: 1` and the staff workspace header.
The Next.js proxy retains its Origin and CSRF checks and forwards cookies and
Set-Cookie as before. Instantiate web clients in browser code; SSR must use a
request-scoped server adapter rather than a shared user's cookie state.

The questionnaire editor (`visitQuestionnairesApi.list/save`) is the migrated
feature. Paths, path parameters, request bodies and results are inferred from
OpenAPI, with no caller-provided response generic. It uses the existing staff
session invalidation handler. The BFF already refreshes module-auth sessions;
its terminal 401 does not trigger another token refresh in the browser.

## Native: direct HTTPS and isolated credentials

```ts
const staff = createApiClient({
  platform: "native",
  baseUrl: "https://api.example.com",
  audience: "staff",
  auth: {
    audience: "staff",
    headers: async () => ({ Cookie: `vetapp_session=${await readStaffSession()}` }),
    onUnauthenticated: clearStaffSession,
  },
});
const profile = dataOf(await staff.GET("/v1/auth/staff/me"));
```

`readStaffSession`/`clearStaffSession` are platform-owned secure-storage adapters,
not package implementations. Native transport uses `credentials: omit` to avoid
an ambient cookie jar and accepts only the staff session cookie through the
adapter. It also adds the CSRF marker required by the existing FastAPI routes.
The client rejects removed owner route namespaces, caller-supplied
Authorization/Cookie headers, insecure URLs and redirects before credential leakage.

The package assumes standards-compatible fetch/Request/Response/Headers; inject
`fetch` for a platform transport when needed. The platform must capture Set-Cookie
on login and persist only its own opaque session. Mobile login UI, secure storage,
cookie capture and a new backend bearer-token protocol are outside this change.
The current clinical API authenticates opaque cookies, not module-auth JWTs.
The generic headers adapter can support a future bearer protocol once the server
implements it; it must never combine bearer and cookie credentials.

An optional `recover` callback is single-flight per instance and retries a 401
once with fresh credentials and the original body. HTTP failures throw `ApiError`
with status and validation details; network failures throw `ApiConnectionError`;
abort errors remain abort errors. Use `parseAs: "blob"` for downloads. Upload
schemas generate binary fields as `Blob`; pass `body: { file: blob }` and
`bodySerializer: multipartBody` (exported by the package) for multipart uploads.
Fetch sets the multipart boundary. A 204 yields `data: undefined` and does not
need `dataOf`. Types describe the wire contract; they are not runtime validators.

The module-auth BFF's existing profile/member/invite read endpoints have explicit
Pydantic response contracts. Its generic proxy still covers provider endpoints
without precise payload schemas; those responses remain unknown rather than
claiming a fabricated type. Clinical JSON document fields remain unknown where
the backend declares free-form JSON, and consumers narrow them before use.

### Clinic bot and retained queues

`GET`/`PUT /clinic-bot` manage the clinic Telegram bot credential. Staff queues
keep historical names `/owner-registrations` and `/visit-requests`.
`GET /join-codes/current` returns the stored clinic code and organization
metadata; it no longer returns an owner join URL.
