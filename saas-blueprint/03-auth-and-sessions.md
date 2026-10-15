# 03 — Authentication & Sessions

## 1. Two audiences, never interchangeable

| | Tenant (customers) | Platform (our staff) |
|---|---|---|
| Account table | `TenantUser` | `User` |
| Pages | `/app/auth/login`, `/register`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/callback` | `/admin/auth/login`, `/forgot-password`, `/reset-password`, `/accept-invite` — **no public registration** |
| Login endpoint | `POST /api/app/auth/login`, `POST /api/v1/auth/login` | `POST /api/admin/auth/login` |
| Identifier | email **or** phone + password | email + password |
| Token claim | `aud: 'tenant'`, `tid: <tenantId>` | `aud: 'platform'` |
| Client storage key | `{{APP_KEY}}_tenant_token` (localStorage) | `{{APP_KEY}}_platform_token` |
| Guard rejects | a platform token → 403 | a tenant token → 403 |
| Landing after login | `/app/dashboard` (or `/app/onboarding`; role `employee` → `/app/me`) | `/admin/dashboard` |

Tokens travel **only** as `Authorization: Bearer <token>`. No cookies for
sessions (the mobile app never sees a cookie). Cookies are used only for the
OAuth `state` and redirect target.

## 2. The auth facade (adapter layer)

**No handler, page or composable may know that JWT + bcrypt is underneath.**
Swapping to another session store or adding WhatsApp OTP must be one adapter
file + one registry line.

```
server/services/auth/
  types.ts                  contracts
  index.ts                  registries + facade — the ONLY import site for business code
  providers/credentials.ts  email/phone + password (bcrypt cost 10)
  providers/handoff.ts      single-use code from an OAuth redirect → session
  providers/otp.ts          stub (throws 501) — seam for phone OTP
  providers/google.ts       RedirectAuthProvider (OAuth 2.0 / OIDC)
  sessions/jwt.ts           SessionDriver — signs/verifies JWT
```

### Contracts (`types.ts`)

```ts
export type Audience = 'tenant' | 'platform'

export interface AuthIdentity { userId: string, audience: Audience, isNew?: boolean }

export interface AuthProvider {
  readonly name: string                 // 'credentials' | 'handoff' | 'otp'
  readonly supports: Audience[]
  /** Proves identity or throws 401. Never returns a token. */
  authenticate(input: Record<string, unknown>, audience: Audience): Promise<AuthIdentity>
}

export interface ExternalProfile {
  provider: string; subject: string           // provider's stable id — never the email
  email: string | null; emailVerified: boolean
  name: string | null; avatarUrl: string | null
}

export interface RedirectAuthProvider {
  readonly name: string
  readonly supports: Audience[]
  isConfigured(): boolean                      // false → button explains, flow bounces back
  authorizationUrl(input: { redirectUri: string, state: string }): string
  exchange(input: { code: string, redirectUri: string }): Promise<ExternalProfile>
  /** Mobile native sign-in: MUST verify the ID token signature. */
  verifyNativeToken?(idToken: string): Promise<ExternalProfile>
}

export interface SessionClaims {
  sub: string            // user id
  aud: Audience
  imp?: string           // platform user id when impersonating
  tid?: string           // tenant pinned into tenant tokens
}

export interface SessionDriver {
  readonly name: string
  issue(claims: SessionClaims): Promise<string> | string
  verify(token: string): Promise<SessionClaims | null> | (SessionClaims | null)
  revoke(token: string): Promise<void>     // no-op for stateless JWT
}

export interface AuthUser {                // "who am I" for both audiences
  id: string; name: string; email: string; phone: string | null; avatarUrl: string | null
  audience: Audience
  role?: { id: string, slug: string, name: string, isSuperAdmin: boolean }  // platform
  permissions?: string[]                                                    // platform
  tenantRole?: 'owner' | 'hr_admin' | 'manager' | 'employee'                // tenant (D3)
  abilities?: string[]                                                      // tenant
  hasPassword?: boolean   // false = OAuth-only account → offer "create password"
}

export interface SignInResult { token: string, expiresAt: string, user: AuthUser, isNew?: boolean }
```

### Facade exports (`index.ts`)

```ts
signIn(input, audience, providerName = 'credentials'): Promise<SignInResult>
issueSession(claims): Promise<string>
revokeSession(token): Promise<void>
readSession(event): Promise<SessionClaims | null>   // parses Bearer header
bearerToken(event): string | null
loadAuthUser(userId, audience): Promise<AuthUser | null>
sessionLifetimeSeconds(): number
getRedirectProvider(name, audience) / availableRedirectProviders(audience)
createAuthHandoff({ tenantUserId, isNew }): Promise<string>
noActiveMembershipMessage(tenantUserId, tenantId?): Promise<string>
```

`getSessionDriver()` picks the driver from env `AUTH_SESSION_DRIVER`
(default `jwt`) and throws at boot on an unknown name.

### `signIn()` algorithm

1. Resolve provider; refuse if it doesn't support the audience.
2. `provider.authenticate(input, audience)` → `userId`.
3. `loadAuthUser()`; inactive → 401.
4. Tenant audience: load active memberships ordered by `createdAt`.
   - none → 403 with `noActiveMembershipMessage()` (distinguishes "never
     joined" from "deactivated by the owner of X — ask them").
   - all belong to deleted tenants → 403 `TENANT_DELETED` with an explicit
     "akun perusahaan Anda sudah dihapus" message.
   - otherwise pin `tid` to the first usable tenant.
5. `issueSession(claims)`, compute `expiresAt`.
6. Update `lastLoginAt` and `lastSeenAt`.

### JWT driver

- Payload `{ sub, aud, imp?, tid? }` — `aud` is our own field, not the JWT
  registered claim. Signed with `JWT_SECRET`, `expiresIn` = `JWT_EXPIRES_IN`
  (default `7d`).
- In production a missing `JWT_SECRET` **throws** — never sign with a default.
- `verify` returns `null` on any failure or on an unknown `aud`.

### Credentials provider

- bcrypt cost 10; `hashPassword` / `verifyPassword` are exported from here and
  this is the only file that imports bcrypt.
- Tenant: identifier containing `@` → email (lowercased), else phone,
  normalized to `62…`. Platform: email only.
- Unknown user, inactive user, **no password on file (OAuth-only)**, or wrong
  password → the *same* 401 "email atau kata sandi salah" (no account
  enumeration, no leak of how someone signs in).

## 3. Server gatekeepers (`server/utils/auth.ts`)

Every API handler (or the util it calls) starts with exactly one of these:

```ts
requirePlatformContext(event)        // 401 / 403 → { user, permissions:Set, isSuperAdmin, impersonatorId, claims }
requirePlatformUser(event)           // → user
requirePermission(event, key)        // 403; superadmin bypasses; key is a typed PermissionKey
requireSuperAdmin(event)             // 403
requireImpersonator(event)           // superadmin AND not already impersonating
requireTenantContext(event)          // 401/403 → { user, tenant(+subscription+plan), membership,
                                     //            tenantId, role, branchIds, impersonatorId, claims }
requireTenantAbility(event, ability) // 403 — tenant RBAC
requireNotImpersonating(event)       // 403 — billing writes
requireBranchAccess(event, branchId) // 404 for other tenant's branch AND out-of-scope branch
requireEntitlement(event, feature)   // 402 PLAN_REQUIRED
requireApiKey(event)                 // X-Api-Key → tenant context, else falls back to bearer session
tryGetSession(event)                 // non-throwing, for anonymous-safe endpoints
```

`requireTenantContext` order of checks:

1. Session present → else 401 `UNAUTHENTICATED`.
2. `aud === 'tenant'` → else 403.
3. `TenantUser` exists and active → else 401.
4. Active membership (in `claims.tid` if present) → else 403 with
   `noActiveMembershipMessage`.
5. Tenant exists; `deletedAt` → 403 `TENANT_DELETED`; `status === 'suspended'`
   → 403 `TENANT_SUSPENDED`.
6. `branchIds` = membership branch rows, or `null` when none (= all branches).
7. Cache on `event.context.tenantContext`; `touchLastSeen('tenant', id)`.

Error convention everywhere:

```ts
throw createError({
  statusCode: 402,
  statusMessage: '<human sentence in the product language — shown verbatim>',
  data: { code: 'LIMIT_REACHED', /* machine details */ }
})
```

## 4. Tenant sign-up (email + password)

`POST /api/app/auth/register` and `POST /api/v1/auth/register` → both call
`registerOwner()` — see `05-tenancy-and-onboarding.md` §2. Returns a tenant
token immediately (the user is signed in), and the console then forces
`/app/onboarding`.

## 5. OAuth sign-in (Google) with a handoff code

The session token **never travels in a URL**. Flow:

```
Browser                         Server                                   Google
  │ GET /api/app/auth/oauth/google/start?redirect=/app/x
  │──────────────────────────────▶│ rate limit (20/15min/IP)
  │                               │ provider.isConfigured()? else 302 /app/auth/login?error=unavailable
  │                               │ state = randomToken(24) → httpOnly cookie
  │                               │ redirect target → httpOnly cookie (same-origin paths only)
  │◀── 302 authorizationUrl ──────│
  │──────────────────────────────────────────────────────────────────────▶│ consent
  │◀─────────────────────── 302 /api/app/auth/oauth/google/callback?code&state
  │──────────────────────────────▶│ compare state with cookie (delete both cookies)
  │                               │ profile = provider.exchange(code)
  │                               │ identity = resolveExternalIdentity(profile)
  │                               │ code2 = createAuthHandoff(identity)   (SHA-256 stored, 120 s TTL)
  │◀── 302 /app/auth/callback?code=code2&redirect=… ─│
  │ POST /api/app/auth/exchange {code: code2}
  │──────────────────────────────▶│ signIn({code}, 'tenant', 'handoff')
  │                               │   → atomic claim: updateMany where usedAt=null and not expired; count must be 1
  │◀── { token, expiresAt, user, isNew } ─│
```

Errors on the callback are reduced to a short code in the redirect
(`?error=cancelled|state|unavailable|…`) and the login page explains it in the
product language.

`resolveExternalIdentity(profile)`:

1. Known `(provider, subject)` in `TenantUserIdentity` → that user (refresh
   stored email). Inactive → 403.
2. Profile has no email → 400.
3. Email matches an existing `TenantUser` **and the provider says it is
   verified** → link a new identity row to it. (Unverified emails must never
   link — that would let someone walk into another business.)
4. Nobody matches → `registerOwner()` with no password and no phone
   (`isNew: true`). Onboarding collects the phone later.

Mobile: `POST /api/v1/auth/oauth/:provider { idToken }` →
`verifyNativeToken()` (signature verified) → same resolution → session.

## 6. Password reset (both audiences)

`server/utils/password-reset.ts`:

- `requestPasswordReset({ audience, email, resetUrlBase })` **always resolves
  successfully** (no enumeration). If the account exists and is active:
  `token = randomToken(32)`, store `sha256(token)` with 2-hour expiry, email
  template `password_reset` with `resetUrl = base + '?token=' + token`.
- `applyPasswordReset({ audience, token, password })`: find by hash; reject if
  wrong audience, used, or expired (400 "tautan sudah tidak berlaku"). In one
  transaction: update the hash, mark this row used, **mark every other
  outstanding reset for that account used**.
- Password rule shared everywhere: `PASSWORD_MIN_LENGTH = 8`.

Change password (signed in): `POST /api/app/change-password`,
`/api/admin/change-password`, `/api/v1/me/change-password`. An OAuth-only
account (`hasPassword: false`) may *create* a password without the old one.

## 7. Invitations

| | Tenant team invite | Platform staff invite |
|---|---|---|
| Table | `TenantInvitation` | `Invitation` |
| Created by | owner (`team.manage`) at `/app/team` (roles `hr_admin` / `manager`) — or HR via the employee record for ESS (below) | `users.write` at `/admin/users` |
| TTL | 7 days | 7 days |
| Token | `randomToken(32)`, only SHA-256 stored | same |
| Email template | `tenant_invitation` (team) / `employee_invitation` (ESS) | `user_invitation` |
| Accept page | `/app/auth/accept-invite?token=` | `/admin/auth/accept-invite?token=` |
| Re-invite same email | upsert on `(tenantId, email)` → new token, old link dead | delete outstanding, create new |

Tenant accept details are in `05-tenancy-and-onboarding.md` §4.

### 7.1 Employee self-service (ESS) login — invite from an Employee record

An `Employee` row (HR data) can exist **without** a login (D2). To give an
employee self-service access:

1. Someone with `employees.write` presses "Undang ke ESS" on the employee record
   (`POST /api/app/employees/:id/invite-ess`). The employee must have a work
   email (or personal email) on the record; missing → 400.
2. Server creates/upserts a `TenantInvitation` with `role: 'employee'` and
   `employeeId` (token rules as above, email template `employee_invitation`).
   **No team seat is consumed** (`teamMembers` counts owner + hr_admin +
   manager only); the `employees` limit is checked when the Employee record is
   created/activated, not at invite time.
3. On accept: create/link `TenantUser`, upsert `TenantMembership` role
   `employee`, and set `Employee.tenantUserId`. One `TenantUser` links to at
   most one Employee per tenant; an Employee already linked → 409.
4. Employee tokens are ordinary tenant tokens (`aud: 'tenant'`, `tid`) but carry
   the **narrowest abilities** (see `04-rbac.md` §2.4): every employee endpoint
   resolves the Employee from `membership → employee.tenantUserId`, never from a
   client-supplied id.
5. Deactivating/terminating the Employee (`Employee.status = 'terminated'`)
   deactivates the linked membership in the same transaction, so a leaver loses
   access immediately; the HR history stays.
6. Landing after login for role `employee` is `/app/me` (ESS home), not
   `/app/dashboard`. Proposed: employees may also sign in with phone +
   password, same rules as owners.

## 8. Rate limiting

`server/utils/rate-limit.ts` — in-memory fixed window, **per Vercel
function instance and best-effort** (move to a shared store such as Upstash
Redis for stricter limits; the interface is store-shaped):

```ts
assertRateLimit(scope, identifier, limit, windowMs)  // throws 429 RATE_LIMITED with retryAfterSeconds
resetRateLimit(key)
clientIp(event)        // x-forwarded-for[0] → x-real-ip → socket
LOGIN_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 }
```

Login: `assertRateLimit('login:tenant', identifier, 5, 15m)` **and**
`assertRateLimit('login:tenant:ip', ip, 20, 15m)`; on success
`resetRateLimit('login:tenant:' + identifier)`. Same for platform. OAuth start,
callback, exchange: 20 / 15 min / IP. Contact form: setting-driven per hour.

Every sign-in success → audit `auth.sign_in`; failure → `auth.sign_in_failed`
(with `tenantId` resolved from the identifier when it matches an account, so
the owner's activity log shows attempts on their business).

## 9. Session refresh & logout

- `POST /api/v1/auth/refresh` mints a new token from a still-valid one,
  **preserving `imp`** so a support session cannot upgrade itself into a real
  one.
- Logout calls `revokeSession` (no-op for JWT) and the client deletes the
  token. Before revoking, the client unregisters its push device while the
  token still authenticates.
- A 401 on any authenticated call makes the client drop that audience's token
  (see `13-tenant-console.md`).

## 10. Impersonation — superadmin only

All doors mint a token carrying `imp: <platformUserId>`, start through
`requireImpersonator()` (superadmin **and not already impersonating** — no
chains), and write a start row and a stop row to `AuditLog`.

| Endpoint | Token minted | Signs you in as |
|---|---|---|
| `POST /api/admin/tenants/:id/impersonate` | tenant (`tid`, `imp`) | that tenant's active owner |
| `POST /api/admin/tenant-users/:id/impersonate` `{ tenantId? }` | tenant | one specific login (oldest active membership if no tenantId) |
| `POST /api/admin/users/:id/impersonate` | **platform** | another staff member |

Rules:

- Impersonated tenant sessions are **read-only for billing** and must never
  reveal sensitive HR data (D7): `employees.sensitive.read` and `payroll.*`
  reads are refused while `imp` is set (proposed), and any read is audited:
  `requireNotImpersonating()` guards checkout, cancel payment, cancel
  subscription. The UI shows a permanent `<ImpersonationBanner>` with "stop".
- Platform impersonation refuses targets that are **another superadmin**
  (lateral move, unreadable audit trail) or **yourself**.
- Storage mechanics on the client: a tenant impersonation writes the *tenant*
  key, so the operator's platform session survives untouched. A platform
  impersonation overwrites the platform key, so the client first stashes the
  original under `{{APP_KEY}}_platform_return_token` and restores it on stop
  (fallback: sign in again). One composable (`useAdminImpersonation`) owns all
  of this; pages never write these keys by hand.
- Stop: `POST /api/app/auth/stop-impersonation` (tenant) or
  `POST /api/admin/auth/stop-impersonation` (platform) → 400 if not an
  impersonated session; audit `*.impersonate_stop`; revoke token.
- Impersonated sessions are never counted in usage analytics and never
  register push devices.

## 11. "Who am I" endpoints

- `GET /api/admin/auth/profile` → `{ user: AuthUser(platform), displayTimezone, impersonating }`
- `GET /api/admin/auth/menus` → DB-driven sidebar pruned to permissions
- `GET /api/app/auth/profile` →

  ```json
  {
    "user": { "id", "name", "email", "phone", "avatarUrl", "audience": "tenant",
              "tenantRole": "owner", "abilities": ["billing.manage", "..."], "hasPassword": true },
    "tenant": { "id", "name", "slug", "status", "logoUrl", "timezone",
                "onboardingCompletedAt": null, "needsBranchSelection": false },
    "employeeId": null,   // set for role employee (and for staff who also have an Employee record)
    "displayTimezone": "Asia/Jakarta",
    "impersonating": false
  }
  ```

- `GET /api/v1/me` — the mobile equivalent, enveloped.

/api/v1 sign-in responses (login, OAuth, accept-invite) share **one** builder
(`apiSession()`) so their shape can never drift:
`{ token, expiresAt, user: { id, name, email, phone, avatarUrl, tenantRole }, tenant: { id, name, slug, status } | null }`.

## 12. Security checklist

- bcrypt cost 10; `passwordHash` never selected into a response — expose only
  `hasPassword: boolean`.
- Rate limiting and other in-memory state are per Vercel instance and
  best-effort only (CLAUDE.md); never rely on them for correctness.
- Employee (ESS) tokens must never be accepted by HR-wide endpoints: those use
  `requireTenantAbility`, and `employee` holds no such ability.
- Reset tokens, invitation tokens, handoff codes, API keys: **only SHA-256
  stored**, raw value exists only in the link/response shown once.
- `JWT_SECRET` required in production.
- Login rate-limited per identifier and per IP.
- Audit rows for: sign-in (+failed), register, suspend/reinstate, plan change,
  impersonation start/stop, role/permission edits, tenant deletion, payment
  cancel, webhook replay, team changes.
