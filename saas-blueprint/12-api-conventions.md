# 12 — API Conventions

## 1. The API surfaces

| Prefix | Consumer | Auth | Response shape |
|---|---|---|---|
| `/api/public/**` | landing site (SSR) | none | plain JSON |
| `/api/app/**` | company (tenant) web console, incl. employee self-service | `Bearer` tenant token | plain JSON; lists `{ items, meta, …extra }` |
| `/api/admin/**` | back-office | `Bearer` platform token | plain JSON; lists `{ items, meta }` |
| `/api/v1/**` | mobile app, integrators | `Bearer` tenant token **or** `X-Api-Key` (where allowed) | **enveloped** |
| `/api/webhooks/payments/:provider` | payment gateway | driver-defined | small JSON ack |
| `/api/cron/**` | external scheduler | none (throttled) | run summary |
| `/api/contact` | landing contact form | none (rate-limited, honeypot) | `{ success }` |

`/api/app/**` is the console's **private** surface — free to change with the
console. `/api/v1/**` is a **public contract** — frozen.

## 2. Thin handlers over shared utils (MUST)

Both `/api/app/**` and `/api/v1/**` are thin handlers over the same
`server/utils/<domain>.ts` functions. That is what keeps the web console and
the app from drifting. Adding a capability:

1. Put the logic (including the role/plan checks) in
   `server/utils/<domain>.ts` as `doThing(event, input)`.
2. Export its zod schema from the same file.
3. Write two handlers:

```ts
// server/api/app/employees/index.post.ts
export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, employeeSchema)
  return createEmployee(event, body)
})

// server/api/v1/employees/index.post.ts
export default defineEventHandler(async (event) => {
  assertJsonRequest(event)
  const body = await readValidatedJson(event, employeeSchema)
  return ok(await createEmployee(event, body))
})
```

4. Add the `/api/v1` endpoint to the docs catalog (§8).

## 3. Validation (`server/utils/validate.ts`)

```ts
parseOrThrow(schema, input)            // first zod issue → 400 VALIDATION_FAILED { field }
readValidatedJson(event, schema)       // readBody + parseOrThrow
validatedQuery(event, schema)          // getQuery + parseOrThrow
assertJsonRequest(event)               // v1: non-GET/HEAD/DELETE must be application/json → 415
```

The **first** issue's message is surfaced verbatim to the user, so every zod
message is written in the product language; `field` carries the English path.

## 4. The `/api/v1` envelope

```jsonc
// single resource
{ "data": { … } }

// list
{ "data": [ … ], "meta": { "page": 1, "limit": 20, "total": 134, "pageCount": 7 } }

// error
{ "error": { "code": "LIMIT_REACHED", "message": "<product-language sentence>", "status": 402,
             "details": { "limit": "employees", "max": 50, "current": 50 } } }
```

Helpers (`server/utils/api-response.ts`):

```ts
ok(data)                                   // { data }
paginated(items, total, page, limit)       // { data, meta }
apiError(status, code, message, extra?)    // throws createError with data.code
toErrorEnvelope(status, statusMessage, data)
parseListQuery(event)                      // see §5
handleETag(event, payload): boolean        // §6
API_ERROR_CODES
```

How the envelope is applied — **two files, neither redundant**:

- `server/plugins/api-envelope.ts` — Nitro `beforeResponse` hook. For
  `/api/v1/**` (except `/api/v1/openapi*`), status < 400, **not an attachment**
  (`Content-Disposition` set → leave the bytes alone), body not null and not
  already `{ data }` / `{ error }` → wrap as `{ data: body }`.
- `server/error.ts` — Nitro `errorHandler`. A thrown `createError()` bypasses
  `beforeResponse`, so errors are shaped here. Only for `/api/v1/**`; for
  other paths it returns without sending so Nitro's builtin handler takes over.
  Unhandled/fatal errors never leak their internal message (generic
  localized message, logged server-side); deliberate 5xx messages written for
  users pass through.

```ts
const handler: NitroErrorHandler = (error, event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/v1/') || path.startsWith('/api/v1/openapi')) return
  const status = error.statusCode || 500
  const envelope = toErrorEnvelope(status,
    error.unhandled || error.fatal ? undefined : error.statusMessage, error.data)
  setResponseStatus(event, status, envelope.error.code)
  setResponseHeaders(event, { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' })
  return send(event, JSON.stringify(envelope))
}
```

### 4.1 Error codes

`code` is English and stable; `message` is the product language and shown
verbatim by every client.

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 / 415 / 422 | bad input (`details.field`) |
| `UNAUTHENTICATED` | 401 | missing/invalid/expired token or key |
| `PLAN_REQUIRED` | 402 | feature not in plan (`details.feature`) |
| `LIMIT_REACHED` | 402 | plan cap hit (`details.limit/max/current`) |
| `FORBIDDEN` | 403 | role/permission/impersonation/scope |
| `TENANT_SUSPENDED` | 403 | company suspended |
| `TENANT_DELETED` | 403 | company deleted |
| `NOT_FOUND` | 404 | (also for out-of-scope resources) |
| `CONFLICT` | 409 | state conflict, duplicates, "deactivate instead" |
| `UPGRADE_REQUIRED` | 426 | mobile build older than `app.minimumMobileVersion` |
| `RATE_LIMITED` | 429 | `details.retryAfterSeconds` |
| `SERVER_ERROR` | 5xx | |

When `data.code` is absent, the status maps to a default code
(400→VALIDATION_FAILED, 401→UNAUTHENTICATED, 402→PLAN_REQUIRED, 403→FORBIDDEN,
404→NOT_FOUND, 409→CONFLICT, 415/422→VALIDATION_FAILED, 426→UPGRADE_REQUIRED,
429→RATE_LIMITED, else SERVER_ERROR).

The same `createError({ statusCode, statusMessage, data: { code } })`
convention is used on `/api/app` and `/api/admin` (they just aren't
enveloped); the web client reads `statusMessage`/`data.code` from the error.

## 5. Lists, filters, pagination

`parseListQuery(event)` — shared by every list endpoint:

| Param | Default | Notes |
|---|---|---|
| `page` | 1 | ≥ 1 |
| `limit` | 20 | 1–**100** |
| `search` | `''` | trimmed |
| `branchId` | null | |
| `dateFrom`, `dateTo` | null | ISO instants; `dateFrom` inclusive, `dateTo` exclusive |
| `sort`, `order` | null, `desc` | whitelist `sort` per endpoint |
| `isActive` | null | `'true'`/`'false'` |

Returns `{ page, limit, search, branchId, dateFrom, dateTo, sort, order,
isActive, skip }`.

**Every table is server-paginated.** No screen filters a full in-memory array.
Console list endpoints answer `{ items, meta: { page, limit, total, pageCount },
...extra }` where `extra` holds top-level aggregates of the *whole filtered
set* (e.g. a sum) or flags (e.g. whether the plan allows export) — the client
reads those rather than summing the page in hand. An endpoint that also feeds
a picker accepts `?all=true` to opt out of paging. v1 list endpoints that
shipped unpaged stay unpaged (frozen).

## 6. Caching for the app

Catalog-style v1 reads (public settings, plans, reference lists) send an ETag
and honour `If-None-Match`:

```ts
export function handleETag(event, payload): boolean {
  const etag = `W/"${sha1(JSON.stringify(payload)).base64url}"`
  setResponseHeader(event, 'ETag', etag)
  setResponseHeader(event, 'Cache-Control', 'private, max-age=0, must-revalidate')
  if (getRequestHeader(event, 'if-none-match') === etag) { setResponseStatus(event, 304); return true }
  return false
}
// handler: const payload = ok(…); if (handleETag(event, payload)) return null; return payload
```

## 7. Versioning, mobile gate and API keys

### 7.1 Frozen `/api/v1`

Once an endpoint or field is published: **add** endpoints and **optional**
fields; never remove, rename or change the type/meaning of one. A field that
lost its purpose keeps being sent with a constant value (document why in a
code comment). A breaking change ships as `/api/v2`. Keep an `API_CHANGELOG`
for the public surface.

### 7.2 Mobile version gate — `server/middleware/mobile-version.ts`

- The app sends `{{CLIENT_HEADER}}` = `x-hrisnexadream-client: HRISNexadream/1.0.0` (`<AppName>/<semver> …`). Mobile is out of scope for now; the gate stays so `/api/v1` is ready.
- For `/api/v1/**` (except `/api/v1/settings/public` and `/api/v1/openapi*`,
  which an outdated app must still reach), if the header is present and its
  version < setting `app.minimumMobileVersion` → **426 `UPGRADE_REQUIRED`**
  `{ minimumVersion, currentVersion }` with a localized "please update" message
  the app shows verbatim.
- Requests without the header (integrators) are never gated.
- The app also reads `minimumMobileVersion` from `/api/v1/settings/public` to
  show its own update screen; the 426 reaches builds that predate that screen.

### 7.3 Tenant API keys (plan feature `apiAccess`)

`server/utils/api-keys.ts`:

- Format `hn_live_<32 hex>` in production, `hn_test_<32 hex>` elsewhere
  (`{{API_KEY_PREFIX}}` = `hn`; not to be confused with the Payment Hub's
  `phk_live_…` platform key). Only `sha256(plaintext)` is
  stored, plus the first 16 chars as `keyPrefix`. **Plaintext shown exactly
  once** at creation.
- Scopes: `read`, `write` (+ proposed `sensitive`, §12). **Enforced by HTTP method at the single door**:
  any method other than GET/HEAD/OPTIONS requires `write` → else 403
  `{ requiredScope: 'write' }`. New routes are covered automatically.
- `requireApiKey(event)`:
  - no `X-Api-Key` header → falls back to `requireTenantContext` (bearer
    session) with both scopes → one handler serves app and integrators;
  - key unknown/inactive/revoked → 401;
  - tenant deleted or not active → 403 `TENANT_SUSPENDED`;
  - plan lacks `apiAccess` → 402 `PLAN_REQUIRED`;
  - scope check; `lastUsedAt` updated best-effort (not awaited);
  - context is built **as the company's owner** (an integration acts on behalf
    of the company) **but with sensitive fields masked** — see §12: a key
    never reads salary/identity data unless it also carries the proposed
    `sensitive` scope.
- Owner (`owner` role only) manages keys at `/app/settings/api-keys`
  (`GET/POST /api/app/api-keys`, `DELETE /api/app/api-keys/:id`, + v1); staff
  can revoke any key at `/admin/api-clients`.
- A code flag can hide the tenant API-key page globally (kill switch) without
  a release.

## 8. Documentation is generated, not written twice

`shared/utils/api-docs.ts` is **the single catalog** of `/api/v1` endpoints.
Both the human page `/docs/api` (SSR, indexable) and
`GET /api/v1/openapi.json` (OpenAPI 3.1) are generated from it.

```ts
export interface ApiEndpoint {
  id: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string                          // '/employees/{id}'
  summary: string                       // product language
  description?: string
  auth: 'none' | 'bearer' | 'bearer-or-apikey'
  params?: { name, in: 'path'|'query'|'header', type, required?, description, example? }[]
  body?: { name, type, description, required? }[]
  responseExample: unknown              // exact wire format, never translated
  responseContentType?: string          // e.g. text/csv for exports
  requestContentType?: string           // e.g. multipart/form-data for uploads
  errors?: string[]                     // codes beyond the global ones
  paginated?: boolean
  cacheable?: boolean                   // ETag
  enterprise?: boolean                  // part of the public integrator reference
  enterpriseSummary?: string            // override prose for integrators
  enterpriseDescription?: string
}
// ApiSection { id, title, description, enterpriseTitle?, enterpriseDescription?, endpoints }
// API_ERROR_CODE_DOCS: { code, status, meaning, enterpriseMeaning? }[]  → the error table
```

- Prose (summaries, descriptions, error meanings) in the product language;
  paths, field names, enum values, codes and example payloads exactly as the
  API emits them.
- Public `/docs/api` shows only `enterprise: true` endpoints (what an API key
  can really call). An internal reference listing everything is served at
  `/internal/api` and `?scope=internal` on the OpenAPI doc **only when**
  setting `app.internalApiDocsEnabled` is on (not a security boundary — just
  keeps plumbing out of public view).
- Only curl samples (plain HTTP; no per-language SDK snippets unless all
  languages get one).
- **A new v1 endpoint is "done" only when its catalog entry exists.**

## 9. Typical `/api/v1` endpoint inventory (platform part)

```
GET  /settings/public            (none, ETag)      app bootstrap
GET  /plans                      (none or bearer)
POST /auth/register | /auth/login | /auth/refresh | /auth/logout
POST /auth/forgot-password | /auth/reset-password
GET  /auth/providers             POST /auth/oauth/:provider {idToken}
GET  /auth/invitation?token      POST /auth/accept-invite
GET  /me   PATCH /me   POST /me/change-password
POST /onboarding
PATCH /settings                  (owner business settings)
GET  /subscription  POST /subscription/checkout  POST /subscription/cancel
GET  /subscription/payments  POST /subscription/payments/:id/cancel
POST /subscription/select-branch
GET/POST /branches  GET/PATCH/DELETE /branches/:id     (office / work location)
GET  /team  PATCH /team/:id  POST /team/invitations  DELETE /team/invitations/:id
GET  /notifications  POST /notifications/:id/read  POST /notifications/read-all
POST /devices  POST /devices/unregister
GET/POST /api-keys  DELETE /api-keys/:id
GET  /account/export  POST /account/delete-request
GET  /activity  GET /activity/actions
POST /uploads                    (multipart image)
POST /usage/ping
GET  /openapi.json
```

## 9.1 HRIS endpoint examples (proposed)

Same util behind `/api/app` and `/api/v1` (§2). Domain detail lives in the
domain spec; this shows the conventions.

```
# company-wide (hr_admin / owner; manager sees own reports only)
GET  /employees?search&branchId&departmentId&status&page&limit     list, masked
POST /employees                       (limit: employees → 402 LIMIT_REACHED)
GET/PATCH /employees/:id              detail; sensitive group masked (§12)
GET  /attendance?employeeId&dateFrom&dateTo&branchId               records
POST /attendance/import               (feature import; multipart CSV)
GET  /leave/requests?status&employeeId   POST /leave/requests/:id/approve|reject
GET  /payroll/periods   GET /payroll/periods/:id/payslips          (feature payroll; hr_admin/owner)

# employee self (role employee; the subject is ALWAYS the session's employee)
GET  /me/employee                     own profile (own sensitive fields unmasked, audited)
GET  /me/attendance?dateFrom&dateTo   POST /me/attendance/clock-in | /clock-out
GET  /me/leave/balances  GET/POST /me/leave/requests  POST /me/leave/requests/:id/cancel
GET  /me/payslips   GET /me/payslips/:id
```

Rules:

- **Employee-self endpoints never take an `employeeId`** (path, query or body):
  the util resolves it from the session, so IDOR is impossible by
  construction. Other people's data is reached only through the company-wide
  routes, gated by role (+ branch/report scope for `manager`).
- Out-of-scope employee ids answer `404 NOT_FOUND`, not 403 (§4.1).
- `employee` logins consume no team seat; `POST /employees` checks the
  `employees` limit against **active** Employee records.
- Time values are ISO instants (UTC) plus the branch `timezone` in the
  payload; "date" fields (`workDate`) are branch-local `YYYY-MM-DD`.
  Money is integer IDR (rupiah) — never float.
- Clock-in accepts `{ latitude?, longitude?, photoPath? }`; with feature
  `attendanceGeofence` an out-of-radius clock-in is `422 VALIDATION_FAILED`
  (`details.field: 'location'`).

## 12. Sensitive-field masking in responses (MUST — D7)

Applies to **every** surface (`/api/app`, `/api/v1`, exports, API keys).

- Sensitive fields: NIK, NPWP, BPJS numbers, bank account number, salary and
  all payroll amounts, family data, identity documents. Stored encrypted;
  decrypted only inside the util that serves an authorised read.
- **Lists always mask** (`nik: "3174••••••••0001"`, `bankAccount: "••••1234"`,
  salary omitted or `null`). **Detail** returns plaintext only when the caller
  holds the explicit ability (`employees.readSensitive`, `payroll.read` —
  `owner`/`hr_admin`; never `manager`) or is the subject of an employee-self
  read. Masked fields keep the same key with a masked string so clients don't
  branch on shape; add `"sensitiveMasked": true` on the object.
- Every successful unmasked read of salary/identity fields writes an audit
  row (`employee.sensitive_read`: actor, employee id, field group — never the
  value). A list or export containing salary requires the ability **and** is
  audited as one row per request.
- **API keys** (`hn_…`): default scopes `read`/`write` return masked values
  only; plaintext requires the proposed extra scope `sensitive`, which the
  owner must tick explicitly and which is audited at key creation. Without it
  a salary field is simply `null`, not a 403, so integrations keep working.
- Impersonated staff sessions are masked regardless of role (`09` §0).
- Errors, logs and `AuditLog.metadata` never contain these values; API docs
  examples use obviously fake data (`3174000000000001`).
- v1 freeze (§7.1) applies: a field that becomes masked keeps its key.

## 10. Uploads

`POST /api/app/uploads`, `POST /api/v1/uploads`, `POST /api/admin/uploads`
(multipart field `file`) → `handleUpload(event, prefix, { maxBytes })` →
`{ path, url, size, contentType }`. See `16-cross-cutting.md` §1.

## 11. Pre-flight checklist for a new endpoint

- [ ] Logic in a util; handler ≤ ~5 lines; same util behind app and v1.
- [ ] Exactly one gatekeeper (or the util calls it); role check before plan check.
- [ ] Every Prisma query in tenant context filters by `tenantId` (+ branch scope).
- [ ] zod schema with product-language messages.
- [ ] Errors via `createError({ statusCode, statusMessage, data: { code } })`.
- [ ] v1: `assertJsonRequest`, `ok()`/`paginated()`, catalog entry, changelog.
- [ ] Lists server-paginated with `parseListQuery`.
- [ ] Audit row for sensitive actions.
