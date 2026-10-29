# Shared API contract

FastAPI's `app.openapi()` is the source of truth. `packages/api-contract/openapi.json`
and `src/generated.ts` are committed build artifacts, never edited by hand.
The existing web API modules export aliases into these generated schemas. Local
form state and presentation helpers remain frontend types.

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
const owner = createApiClient({
  platform: "native",
  baseUrl: "https://api.example.com",
  audience: "owner",
  auth: {
    audience: "owner",
    headers: async () => ({ Cookie: `vetapp_owner_session=${await readOwnerSession()}` }),
    onUnauthenticated: clearOwnerSession,
  },
});
const profile = dataOf(await owner.GET("/owner/me"));
```

`readOwnerSession`/`clearOwnerSession` are platform-owned secure-storage adapters,
not package implementations. Native transport uses `credentials: omit` to avoid
an ambient cookie jar and accepts only the audience's session cookie through the
adapter. It also adds the CSRF marker required by the existing FastAPI routes.
Use a separate staff instance with `vetapp_session`, its own storage and callbacks.
The client rejects cross-audience routes, cookie mixing, caller-supplied
Authorization/Cookie headers, insecure URLs and redirects before credential leakage.
Web cookies can coexist: each backend route selects its own session cookie.

The package assumes standards-compatible fetch/Request/Response/Headers; inject
`fetch` for a platform transport when needed. The platform must capture Set-Cookie
on login and persist only its own opaque session. Mobile login UI, secure storage,
cookie capture and a new backend bearer-token protocol are outside this change.
The current clinical API authenticates opaque cookies, not module-auth JWTs.
The generic headers adapter can support a future bearer protocol once the server
implements it; it must never combine bearer and cookie credentials.

An optional `recover` callback is single-flight per instance and retries a 401
once with fresh credentials and the original body. Owner recovery cannot call
staff callbacks. HTTP failures throw `ApiError` with status and validation details;
network failures throw `ApiConnectionError`; abort errors remain abort errors.
Use `parseAs: "blob"` for downloads. Upload schemas generate binary fields as
`Blob`; pass `body: { file: blob }` and `bodySerializer: multipartBody` (exported
by the package) for multipart uploads. Fetch sets the multipart boundary.
A 204 yields `data: undefined` and does not
need `dataOf`. Types describe the wire contract; they are not runtime validators.

The module-auth BFF's existing profile/member/invite read endpoints have explicit
Pydantic response contracts. Its generic proxy still covers provider endpoints
without precise payload schemas; those responses remain unknown rather than
claiming a fabricated type. Clinical JSON document fields remain unknown where
the backend declares free-form JSON, and consumers narrow them before use.
