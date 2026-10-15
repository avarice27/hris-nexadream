# 05 — Tenancy, Sign-up, Onboarding & Team

## 1. The tenant model

```
Tenant  (= the customer company "Perusahaan" = the billing account)
 ├── Subscription → Plan        (exactly one row per tenant, created at signup)
 ├── SubscriptionEvent[]        (append-only history)
 ├── Payment[]
 ├── TenantMembership → TenantUser   (owner | hr_admin | manager | employee logins)
 │     └── TenantMembershipBranch[]  (empty = every branch)
 ├── TenantInvitation[]
 ├── ApiClient[]
 ├── TrialClaim?
 ├── Employee[]                 (HR master rows; may exist WITHOUT a login;
 │                               Employee.tenantUserId links an ESS login)
 └── Branch[]                   (office / work location; one primary created at signup)
       └── …domain rows (every one also carries tenantId)
```

Rules (MUST):

1. **Every tenant-owned row carries `tenantId`**, even when `branchId`
   implies it. It is the only defence against cross-tenant leakage.
2. **Every tenant-scoped query goes through `requireTenantContext()`** and
   includes `tenantId` in `where`. Review rule: *a Prisma call in a
   `/api/app/**` or `/api/v1/**` path without `tenantId` in the `where` is a
   bug.*
3. One login belongs to **one company** today (tenant switching is not
   built). The schema already allows many (`TenantMembership` is a join table;
   tokens carry `tid`). An address with a membership in another non-deleted
   tenant — **even an inactive one** — cannot be invited or accept an
   invitation (409). The inviter is told only *that* it belongs elsewhere,
   never *where*; the invitee (who owns the address) is told the name.
4. Data is **never deleted** to tidy up: branches over the plan cap become
   inactive; members are deactivated; **employees are terminated/inactivated,
   never deleted** (payslips, attendance and leave history must survive);
   tenants are soft-deleted.
5. Timestamps stored UTC. `Tenant.timezone` is the display clock for screens
   without a branch; `Branch.timezone` cuts that branch's day boundaries.
6. The console works in **one branch at a time**: `useActiveBranch()` holds
   the choice (`localStorage`, self-healing if the id no longer belongs to the
   tenant), a `<BranchSwitcher>` at the top of the nav rail changes it. Pages
   read `activeBranchId`; they never grow their own branch filter.

---

## 2. Sign-up — `registerOwner()` (`server/utils/registration.ts`)

Shared by `POST /api/app/auth/register`, `POST /api/v1/auth/register` and the
OAuth "new account" path. Signup asks **only for the person**; business
details come in onboarding.

Schema (messages in the product language):

```ts
export const registrationSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  phone: z.string().refine(isValidIndonesianPhone),
  password: z.string().min(8),
  companyName: z.string().trim().optional(),    // optional at signup; collected in onboarding
  timezone: z.enum(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']).default('Asia/Jakarta'),
  acceptTerms: z.literal(true)                  // consent to terms + privacy
})
```

Algorithm:

1. Setting `app.registrationOpen` false → 503.
2. Normalize email (trim, lowercase) and phone (`62…`).
3. Email taken → 409 `CONFLICT` `{ field: 'email' }`; phone taken → 409
   `{ field: 'phone' }`.
4. **Trial guard**: if setting `billing.oneTrialPerEmail` is true, look up
   `TrialClaim` by normalized email.
5. Read settings `billing.trialPlanSlug` (default `business`, proposed — D4 gives
   growth and business 14 trial days) and
   `billing.defaultPlanSlug` (default `free`). Free plan missing → 500.
6. `grantTrial = trialPlanExists && !priorClaim`. Plan = trial plan or free.
   `trialEndsAt = now + plan.trialDays`.
7. **One transaction**:
   - create `TenantUser` (hash password if given; `emailVerifiedAt` when the
     OAuth provider vouched);
   - create `Tenant` (name provisionally = company name or owner name; unique
     slug; `dataConsentAcceptedAt = now`);
   - create `TenantMembership` role `owner`;
   - create `Subscription` (`trialing` + `trialEndsAt`, or `downgraded` on free);
   - create `SubscriptionEvent` `{ transition: 'signup', toStatus, toPlanSlug, period: 'monthly' }`;
   - create `TrialClaim` if a trial was granted and the guard is on;
   - create the primary `Branch` (office; `isPrimary: true`, default name
     "Kantor Pusat", unique code). No `Employee` row is created for the owner:
     the owner is not auto-counted against the `employees` limit; HR adds them
     like anyone else if wanted (proposed).
8. `invalidateEntitlements(tenantId)`.
9. In-app notifications `welcome` and (if trial) `trial_started` — **email
   channel off** for these; the welcome **email** is sent separately with
   richer variables (`name`, `tenantName`, `loginUrl`).
10. `notifyPlatform('tenants.read', { templateKey: 'admin_new_tenant' })` —
    bell for staff, no email.
11. Return a tenant session token (`{ sub, aud: 'tenant', tid }`) → the user is
    signed in; audit `tenant.register`.

Slug: `slugify(name) || 'perusahaan'`, append `-2`, `-3`… until unique;
`uniqueTenantSlug(name, excludeTenantId)` lets a tenant keep its own slug when
renamed.

Why the trial is keyed on **email** (not phone): an email exists on every
signup path including OAuth, so the check runs once at signup and is never
revisited. Since signup already refuses duplicate emails, the claim only bites
after an account is deleted and its address freed. This is an accepted
trade-off; do not reintroduce a late phone check that revokes a granted trial.

---

## 3. Onboarding — blocking, once (`server/utils/onboarding.ts`)

`POST /api/app/onboarding`, `POST /api/v1/onboarding`. Gated by
`settings.manage` (owner). Target: done in under 3 minutes.

Client rule: while `tenant.onboardingCompletedAt` is null, the route middleware
redirects every `/app/**` page to `/app/onboarding`; once set, visiting
`/app/onboarding` redirects to the dashboard.

Steps shown to the owner (one short wizard):

1. **Profil perusahaan** — company name, phone, industry (optional).
2. **NPWP perusahaan (opsional)** — can be skipped; payroll (PPh 21) later
   requires it and prompts again. Stored encrypted (D7), masked afterwards.
3. **Kantor pertama** — first branch name, address, timezone (WIB/WITA/WIT).
4. **Hari & jam kerja** — working days (default Mon–Fri), standard start/end
   time, break; becomes the default work calendar/shift.
5. **Kebijakan cuti default** — annual leave days (default 12 per UU
   Ketenagakerjaan after 12 months' service), accrual start rule, sick/maternity
   defaults; seeded as editable leave types.
6. Data-consent checkbox (UU PDP).

Schema:

```ts
export const onboardingSchema = z.object({
  companyName: z.string().min(2),
  phone: z.string().refine(isValidIndonesianPhone).optional(), // required only if the account has none (OAuth)
  npwp: z.string().refine(isValidNpwp).optional(),             // optional; encrypted at rest
  branchName: z.string().min(2),
  branchAddress: z.string().optional(),
  timezone: z.enum(TIMEZONES).default('Asia/Jakarta'),
  workingDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  workStartTime: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  workEndTime: z.string().regex(/^\d{2}:\d{2}$/).default('17:00'),
  annualLeaveDays: z.number().int().min(0).max(60).default(12),
  acceptDataConsent: z.literal(true)
})
```

Algorithm (idempotent — a second call updates, never duplicates):

1. Resolve owner phone: keep existing; else require submitted (400) and check
   it is not used by another account (409).
2. If the company name changed, regenerate the slug.
3. One transaction: set phone on user if newly given; update tenant (`name`,
   `slug`, `phone` if empty, encrypted `npwp` if given, `timezone`,
   `dataConsentAcceptedAt`, `onboardingCompletedAt = now`); update (or create)
   the **primary branch** with name/address/timezone, `isPrimary`, `isActive`;
   upsert the default work schedule (working days/hours); create the default
   leave types (annual, sick, …) with the chosen annual quota, skipping names
   that already exist (case-insensitive).
4. Return `{ success: true }` (+ any frozen v1 fields).

---

## 4. Team — logins that share a company (`server/utils/team.ts`)

Two kinds of invitation exist; do not mix them:

| | Team invite | Employee (ESS) invite |
|---|---|---|
| Roles | `hr_admin`, `manager` (owner is never invited) | `employee` |
| Started from | `/app/team` (`team.manage`) | the Employee record (`employees.write`) — see `03` §7.1 |
| Consumes | a `teamMembers` seat (active + pending invites, incl. owner) | **no seat** — the `employees` limit counts active Employee records, checked on create/activate of the Employee |
| Needs an Employee row | no | yes (`TenantInvitation.employeeId`) |
| Branch scope | optional (`branchScopedRoles`) | follows the Employee's branch |

A `manager` login should be linked to an Employee record so `reportIds` work
(`04` §2.2.1); a manager without a linked Employee has no reports and sees
nothing (fail closed).

Functions (each used by both `/api/app/team/**` and `/api/v1/team/**`):

| Function | Ability | Notes |
|---|---|---|
| `listTeam(event)` | `team.manage` | members + pending invitations + seat usage |
| `inviteMember(event, { email, name?, role, branchIds? })` | `team.manage` | see below |
| `revokeInvitation(event, id)` | `team.manage` | sets `revokedAt`, audit `team.invite_revoke` |
| `updateMember(event, membershipId, { role?, branchIds?, isActive? })` | `team.manage` | see below |
| `previewInvitation(token)` | public | what the accept page shows before a password |
| `acceptInvitation(event, { token, name, password? }, hashPassword)` | public | see below |
| `teamSeatSummary(event)` | any member | used/pending/limit (owner + hr_admin + manager only) |
| `inviteEmployeeToEss(event, employeeId)` | `employees.write` | creates `employee`-role invitation; no seat check; 409 if already linked |
| `employeeSummary(event)` | `employees.read` | active employees / `employees` limit |

**Invite**:
1. Seat check: `assertWithinLimit(tenantId, 'teamMembers', activeMembers + pendingUnexpiredInvites)`.
2. Address already a member here → 409. Member of another tenant → 409 (no name).
3. `branchIds = resolveBranchScope(tenantId, requested)` — dropped to `[]` when
   the plan lacks `branchScopedRoles`; filtered to the tenant's own branches.
4. `token = randomToken(32)`; upsert `TenantInvitation` on `(tenantId, email)`
   with `sha256(token)`, 7-day expiry, clearing `acceptedAt`/`revokedAt`.
5. Email `tenant_invitation` with `inviteUrl = {{SITE_URL}}/app/auth/accept-invite?token=…`,
   inviter name, tenant name, role label, expiry formatted in the tenant's
   timezone.
6. Audit `team.invite`.

**Accept**:
1. Find by token hash; used/revoked/expired → 400 "undangan sudah tidak berlaku".
2. Seat check again (`activeMembers`) — skipped for `employee` invitations; for
   those, link `Employee.tenantUserId` in the same transaction instead.
3. Existing account with that email in another tenant → 409 (with name).
4. Ask for a password **only** when the account has no way to sign in (new
   account, or existing with neither password nor linked identity). An
   invitation must never overwrite someone's credentials.
5. Transaction: create/update `TenantUser` (`emailVerifiedAt = now` for new —
   the email link proves it); upsert membership `(tenantId, tenantUserId)` with
   the invited role, `isActive: true`; replace branch rows; mark invitation
   accepted.
6. Audit `team.invite_accept`; `invalidateEntitlements`; notify the owner
   (`team_invite_accepted`, bell + push, **no email**; failures swallowed).
7. Client receives a session (tenant token) and lands in the console.

**Update member**:
- Owner's membership → 409 (ownership is not editable here).
- Your own membership → 409.
- Reactivating → refuse if active elsewhere; `assertWithinLimit('teamMembers', activeMembers)`
  (skipped for role `employee`; reactivating an *Employee* record instead runs
  `assertWithinLimit('employees', activeEmployees)`).
- Role change, branch change, (de)activation each write their own audit row
  (`team.role_change`, `team.branch_change`, `team.reactivate` / `team.deactivate`).
- Members are **deactivated, never deleted** (history points at them).

---

## 5. Branches (optional multi-location module)

- `createBranch`: `assertWithinLimit(tenantId, 'branches', countAll)`; a
  short unique `code` is allocated (`allocateBranchCode(tx)`).
- `updateBranch` re-activating: `assertWithinLimit('branches', activeCount)`.
- `deleteBranch`: refused (409) if anything historical points at it (employees,
  attendance, payslips…) — tell the owner to deactivate instead.
- Downgrade over the cap → `enforceBranchLimit()` (see
  `07-subscription-lifecycle.md` §6) and a blocking "choose which branches stay
  active" dialog: `POST /api/app/subscription/select-branch { branchIds }`.

Branches stay in HRIS: they are offices / work locations (timezone, geofence
centre, public-holiday region). Each Employee belongs to one primary branch.

### 5.1 Employees and the `employees` limit

- `createEmployee`: `assertWithinLimit(tenantId, 'employees', activeEmployeeCount)`
  (402 `LIMIT_REACHED`). Bulk import checks `active + incoming` up front and
  refuses the whole file rather than half-importing.
- Reactivating a terminated/inactive employee re-runs the same check.
- "Active" = `status ∈ {active, probation, on_leave}` (proposed); `terminated`
  and `inactive` do not count, but **their records are kept**.
- Employee creation never requires a login; ESS invitation is a separate step.

---

## 6. Tenant settings (owner)

`updateTenantSettings(event, body)` (`settings.manage`), used by
`PATCH /api/app/settings` and `PATCH /api/v1/settings`: name, phone (normalized),
email, timezone, logo URL, NPWP, work calendar / default hours, leave policy
defaults, + domain fields. **Paid settings call
`requireEntitlement` only when the paid option is being chosen** — turning it
off, or saving other fields, must never require the plan (a downgraded owner
must still be able to rename their business).

---

## 7. Tenant lifecycle (platform side)

| Action | Endpoint | Gate | Effect |
|---|---|---|---|
| Suspend | `POST /api/admin/tenants/:id/suspend { reason }` | `tenants.write` | `status=suspended`, `suspendedAt`, `suspendedReason`; `transitionSubscription('suspend', force)`; notify owner `tenant_suspended`; audit `tenant.suspend`. All tenant requests → 403 `TENANT_SUSPENDED`. |
| Reinstate | `POST /api/admin/tenants/:id/reinstate` | `tenants.write` | `status=active`, clear suspension; `transitionSubscription('reinstate', force)` → `active` if paid period remains else `downgraded`; audit. |
| Change plan (override) | `POST /api/admin/tenants/:id/plan { planSlug, period, status, currentPeriodEnd?, note? }` | `subscriptions.write` | Bypasses the transition guard on purpose (comped / negotiated). One transaction: update subscription + `SubscriptionEvent { transition: 'admin_override' }`. Then `invalidateEntitlements`, `enforceBranchLimit`, audit `subscription.plan_change`. |
| Soft delete | `DELETE /api/admin/tenants/:id` | **superadmin** | `deletedAt=now`, `status=deleted`; email/notify owner `tenant_deleted` (it's their last message); audit `tenant.delete`. Hard purge is a separate job after retention. |
| Impersonate owner | `POST /api/admin/tenants/:id/impersonate` | superadmin, not impersonating | see `03-auth-and-sessions.md` §10 |

---

## 8. Owner data rights (privacy law — UU PDP / GDPR-style)

Shared by console and `/api/v1` (app stores require the deletion path inside
the app):

- **Export** — `GET /api/app/account/export`, `GET /api/v1/account/export`
  (`account.manage`, owner only): JSON of everything the tenant owns (tenant,
  subscription, branches, payments, notifications (last 500), + every domain
  table: employees, attendance, leave, overtime, reimbursements, payroll runs,
  payslips, documents metadata, performance reviews). **Serverless note:** a
  large company's export must not be built in one function call — stream it, or
  create an export job (Vercel Cron processes it, file via the storage adapter,
  signed download link) when the row count is large (proposed).
  Sensitive fields (NIK, NPWP, BPJS, bank, salary, family) are included **only
  for the owner**, are decrypted for the export, and the export itself is
  audit-logged (`account.export`). Sent with `Content-Disposition: attachment;
  filename="{{APP_KEY}}-data-<slug>.json"` (the v1 envelope plugin leaves
  attachments alone).
- **Deletion request** — `POST /api/app/account/delete-request
  { reason?, confirmation: true }` (`account.manage`): a *request*, not an
  immediate purge. Sets `deleteRequestedAt` (second request → 409), audit
  `tenant.delete_request`, notify staff with `tenants.write` (warning level,
  link to `/admin/tenants/:id`), return `{ slaDays }` from
  `privacy.deleteRequestSlaDays`.
- **UU PDP erasure vs statutory retention (caveat, proposed wording)** —
  employee and payroll data is personal data the *company* controls (the
  platform is the processor). A deletion request therefore cannot blindly purge
  everything: Indonesian rules require the employer to retain certain records
  (payroll/tax documents such as PPh 21 evidence, BPJS contributions, employment
  contracts and company financial records) for a statutory period (commonly
  5–10 years depending on the document; **legal review needed before the number
  goes in copy**). Policy: on approved deletion, (a) everything not under
  retention is erased, (b) retained payroll/tax/employment records are
  restricted (no login, no ESS, excluded from normal processing), kept
  encrypted, and purged automatically when `privacy.statutoryRetentionYears`
  elapses, (c) the owner is told exactly which categories are retained and why.
  Individual employees' own erasure/correction requests go to the company (HR),
  not the platform; HR resolves them in the employee record with the same
  retention exception, audit-logged.
- Public page `/hapus-akun` (account deletion info) reads its promises
  (contact, SLA days, backup retention, statutory HR/financial-record
  retention) from settings so the page and the app can never disagree.
- Consent captured at signup and onboarding (`dataConsentAcceptedAt`).
- `privacy.retentionMonths` setting documents how long personal data is kept.
