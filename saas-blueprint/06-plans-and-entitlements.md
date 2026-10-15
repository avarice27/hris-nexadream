# 06 — Plans & Entitlements

## 1. Principle: tiers are config, not code

Plan limits and features must be **editable by a superadmin without a
deploy**. `Plan.limits` and `Plan.features` are JSON columns. Code fixes only
the **keys** (and their labels); values live in the DB and are edited at
`/admin/plans`.

**Never branch on a plan slug** to decide what a tenant may do
(`if (plan.slug === 'business')` is a bug). Read `features` / `limits`. Slugs
are cosmetic (badge colour) at most.

## 2. Key catalog — `shared/utils/plans.ts`

```ts
// Per D4. Values per tier are seeded (02-database-schema.md §4) and editable in /admin/plans.
export const LIMIT_KEYS = [
  'employees',                // active Employee records (HR rows, with or without a login)
  'branches',                 // active branches (offices)
  'teamMembers',              // owner + hr_admin + manager logins + outstanding invitations; employee logins excluded
  'reportRetentionDays',      // how far back reports can look
  'storageMb'                 // documents / payslip PDFs / attachments
] as const
export type LimitKey = (typeof LIMIT_KEYS)[number]

export const FEATURE_KEYS = [
  'leaveManagement',    // leave types, requests, approvals, balances
  'shiftScheduling',    // shifts and rosters
  'attendanceGeofence', // geofenced / selfie clock-in
  'overtime',           // overtime requests + calculation
  'reimbursement',      // expense claims
  'payroll',            // payroll runs, PPh 21, BPJS, payslips
  'performanceReview',  // basic performance review cycles
  'documentVault',      // company + employee documents
  'export',             // CSV/XLSX export
  'import',             // CSV/XLSX import (e.g. bulk employees)
  'multiBranchRollup',  // whole-company report view
  'branchScopedRoles',  // restrict members to branches
  'customApprovalFlows',// multi-step / custom approval chains
  'activityLog',        // tenant-visible audit trail
  'apiAccess',          // tenant API keys (X-Api-Key)
  'prioritySupport'
] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

export type PlanLimits = Record<LimitKey, number>
export type PlanFeatures = Record<FeatureKey, boolean>

export const UNLIMITED = -1            // everywhere

/** label = column/field heading; sentence = noun phrase used in messages; hint = form help */
export const LIMIT_META: Record<LimitKey, { label: string, sentence: string, hint: string, unit?: string }>
export const FEATURE_META: Record<FeatureKey, { label: string, hint: string }>

export function formatLimit(key, value): string   // -1 → 'Tanpa batas', else id-ID number + unit

/** Defaults used when a Plan row predates a newly added key. */
export const DEFAULT_LIMITS: PlanLimits
export const DEFAULT_FEATURES: PlanFeatures          // all false

export function normalizeLimits(raw: unknown): PlanLimits     // start from defaults, copy finite numbers
export function normalizeFeatures(raw: unknown): PlanFeatures // start from defaults, copy booleans
```

Labels (`LIMIT_META` / `FEATURE_META`, Bahasa Indonesia; `sentence` is the noun
phrase used in the 402 message):

| Key | `label` | `sentence` | unit |
|---|---|---|---|
| `employees` | Karyawan aktif | karyawan aktif | orang |
| `branches` | Kantor / cabang | kantor atau cabang aktif | |
| `teamMembers` | Pengguna tim | pengguna tim (Pemilik, Admin HR, Atasan) | |
| `reportRetentionDays` | Riwayat laporan | hari riwayat laporan | hari |
| `storageMb` | Penyimpanan | MB penyimpanan dokumen | MB |

| Feature key | `label` |
|---|---|
| `leaveManagement` | Manajemen cuti |
| `shiftScheduling` | Penjadwalan shift |
| `attendanceGeofence` | Absensi geofence / selfie |
| `overtime` | Lembur |
| `reimbursement` | Reimbursement |
| `payroll` | Penggajian & slip gaji |
| `performanceReview` | Penilaian kinerja |
| `documentVault` | Brankas dokumen |
| `export` | Ekspor data |
| `import` | Impor data |
| `multiBranchRollup` | Laporan gabungan semua kantor |
| `branchScopedRoles` | Batasi akses per kantor |
| `customApprovalFlows` | Alur persetujuan kustom |
| `activityLog` | Log aktivitas |
| `apiAccess` | Akses API |
| `prioritySupport` | Dukungan prioritas |

Free-tier suggestion (seed, proposed): `leaveManagement` on (core HR), everything
paid-looking (`payroll`, `attendanceGeofence`, `overtime`, `reimbursement`,
`shiftScheduling`, `performanceReview`, `documentVault`, `customApprovalFlows`,
`apiAccess`, `prioritySupport`) off; concrete values per tier live in the seed.

Always read plan JSON through `normalizeLimits` / `normalizeFeatures` — a new
key added in code must work for plans saved before it existed (the default is
the conservative value).

## 3. Entitlements module — `server/utils/entitlements.ts`

**The only place `Plan.limits` / `Plan.features` are read.**

```ts
export interface Entitlements {
  tenantId: string
  planSlug: string            // the plan on the subscription row
  planName: string            // name of the plan actually in force
  effectivePlanSlug: string   // honouring trial and grace
  status: string
  limits: PlanLimits
  features: PlanFeatures
  trialEndsAt: Date | null
  trialDaysRemaining: number | null
  graceEndsAt: Date | null
  currentPeriodEnd: Date | null
  isTrialing: boolean
  isInGrace: boolean
}

getEntitlements(tenantId): Promise<Entitlements>    // 60 s per-tenant cache
can(tenantId, feature): Promise<boolean>
limit(tenantId, key): Promise<number>               // -1 = unlimited
isWithinLimit(tenantId, key, currentCount): Promise<boolean>
assertWithinLimit(tenantId, key, currentCount)      // throws 402 LIMIT_REACHED
invalidateEntitlements(tenantId?)                    // no arg = clear all
gracePeriodDays(): Promise<number>                  // setting billing.gracePeriodDays
```

Does the subscription grant its plan *right now*?

```ts
function subscriptionGrantsPlan(s: Subscription, now: Date): boolean {
  switch (s.status) {
    case 'trialing':  return !s.trialEndsAt || s.trialEndsAt > now
    case 'active':    return true
    case 'cancelled': return Boolean(s.currentPeriodEnd && s.currentPeriodEnd > now)
    case 'past_due':  return Boolean(s.graceEndsAt && s.graceEndsAt > now)
    default:          return false   // downgraded, suspended
  }
}
// effective plan = grants ? subscription.plan : the 'free' plan  (never "no access")
```

`assertWithinLimit` error:

```ts
throw createError({
  statusCode: 402,
  statusMessage: `Langganan ${planName} hanya mengizinkan ${max} ${LIMIT_META[key].sentence}. Upgrade untuk menambah lagi.`,
  data: { code: 'LIMIT_REACHED', limit: key, max, current: currentCount }
})
```

`requireEntitlement(event, feature)` (in `auth.ts`) error:

```ts
throw createError({
  statusCode: 402,
  statusMessage: 'Fitur ini belum tersedia di langganan Anda. Upgrade untuk membukanya.',
  data: { code: 'PLAN_REQUIRED', feature }
})
```

**Call `invalidateEntitlements(tenantId)` after any change to** the
subscription, the plan, branches, employees (active count) or team membership.
The 60 s cache is per instance and best-effort; limit checks that must be
correct (`assertWithinLimit`) take the live count from the database. Call it with no argument
after editing a `Plan` (every tenant on it is stale).

## 4. 402 vs 403

- **403** — "your role can't do this" (talk to your owner).
- **402** — "your plan doesn't include this" (upgrade).

The tenant UI catches 402 globally and opens the **upgrade dialog**; the
mobile app does the same. They are never conflated.

## 5. How gates behave past the limit (pattern table)

Fill this table for the new product. Three behaviours exist; pick per rule:

| Behaviour | When to use | Example |
|---|---|---|
| **Refuse** (402) | creating something new beyond a cap; using a paid action | `employees` cap on create → `LIMIT_REACHED`; `payroll` run → `PLAN_REQUIRED` |
| **Clamp** (succeed with less) | reading history further back than allowed | `reportRetentionDays` clamps the date window and returns `window.clamped: true` so the UI explains |
| **Degrade silently** (keep data, stop the effect) | a downgrade must not destroy configuration | `branchScopedRoles` off → scope ignored; a paid display option stops rendering but the choice is kept |

| Rule | Where | Past the limit |
|---|---|---|
| `employees` (active Employee records) | `createEmployee`, employee reactivation, bulk import | 402 `LIMIT_REACHED` (import refused whole) |
| `branches` | `createBranch`, branch reactivation | 402 `LIMIT_REACHED` |
| `teamMembers` (owner + hr_admin + manager + outstanding invites) | team invite, reactivate, accept — **not** ESS invites | 402 `LIMIT_REACHED` |
| `storageMb` | document / attachment upload | 402 `LIMIT_REACHED` (existing files stay readable) |
| `reportRetentionDays` | report window resolver | window clamped, flagged |
| `leaveManagement` | leave type / request / approval routes | 402 `PLAN_REQUIRED` |
| `shiftScheduling` | shift + roster routes | 402 `PLAN_REQUIRED`; plain fixed-hours attendance still works |
| `attendanceGeofence` | geofence/selfie rules on clock-in | rule **degrades silently** (clock-in allowed without the check, config kept); creating/editing a geofence → 402 |
| `overtime` | overtime request/approve routes | 402 `PLAN_REQUIRED` |
| `reimbursement` | claim routes | 402 `PLAN_REQUIRED` |
| `payroll` | payroll run create/calculate/approve, payslip generation | 402 `PLAN_REQUIRED`; **already-issued payslips stay readable** by employees and HR |
| `performanceReview` | review cycle routes | 402 `PLAN_REQUIRED` |
| `documentVault` | upload/manage company documents | 402 `PLAN_REQUIRED`; reading existing stays open |
| `customApprovalFlows` | approval-flow editor | 402; default single-step approval keeps working |
| `multiBranchRollup` | report window resolver | falls back to primary branch |
| `export` | `requireEntitlement` on export routes | 402 `PLAN_REQUIRED` |
| `import` | `requireEntitlement` after the role check (templates stay open) | 402 |
| `apiAccess` | `requireApiKey` | 402 |
| `branchScopedRoles` | `resolveBranchScope` | scope dropped, member gets all branches |
| `activityLog` | activity endpoint (also capped by `privacy.auditRetentionDays`) | 402 |

Ungated on every tier (do not "fix"): an employee's own attendance clock-in,
own payslip/leave-balance reading, and the sensitive-data audit trail required
by D7 / UU PDP (the *tenant-visible* activity log is the gated feature, the
audit write is not). Past due/expired plans never lock employees out of their own
issued payslips.

Retention **clamps** rather than refuses on purpose: a shorter chart the owner
understands beats an error they cannot act on.

Some things are deliberately **ungated on every tier** (e.g. data that makes
reports honest). Record such decisions next to the table so nobody "fixes"
them.

## 6. Usage counts for the UI

`GET /api/app/entitlements` returns entitlements **plus current usage** so the
UI can disable a button before the API answers 402:

```json
{ "...Entitlements": "…", "usage": { "employees": 87, "branches": 2, "teamMembers": 2, "storageMb": 312 } }
```

Client composable `useEntitlements()` (`useState`-backed, one fetch per page
load):

```ts
can(feature) / limit(key) / isUnlimited(key) / used(key) / remaining(key) / atLimit(key)
upgradeRequired(feature, message?)   // opens the dialog
handlePlanError(caught): boolean     // 402 → opens dialog with server message; returns true if handled
```

Every write that can hit a gate wraps its catch:

```ts
try { await apiFetch('/api/app/…', { method: 'POST', body }) }
catch (e) { if (!handlePlanError(e)) toast.add({ title: '…', description: extractErrorMessage(e), color: 'error' }) }
```

Navigation entries tied to a paid feature are **shown with a lock**, never
hidden — the page opens the upgrade dialog. Hiding them hides what you are
selling.

An "Upgrade" button at the foot of the tenant rail hides itself when the
current plan already has every feature or when the role cannot buy
(`billing.manage`). It reads `features`, never a slug.

## 7. Admin plan management

Endpoints (`plans.read` / `plans.write`):

```
GET    /api/admin/plans
POST   /api/admin/plans          body = planSchema
PATCH  /api/admin/plans/:id      body = planSchema.partial()
DELETE /api/admin/plans/:id
```

```ts
export const planSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
  priceMonthly: z.number().min(0),
  priceYearly: z.number().min(0),
  trialDays: z.number().int().min(0),
  isActive: z.boolean().default(true),   // purchasable
  isPublic: z.boolean().default(true),   // listed on pricing + billing pages
  order: z.number().int().default(0),
  limits: z.record(z.enum(LIMIT_KEYS), z.number()),      // keys validated against catalog
  features: z.record(z.enum(FEATURE_KEYS), z.boolean())
})
```

- Create: slug unique (409).
- Update: slug clash → 409. Then `invalidateEntitlements()` (all tenants).
- Delete: refused while any subscription references it ("deactivate instead"),
  and the `free` plan (the downgrade target) can never be deleted.
- The editor form renders one numeric field per `LIMIT_KEYS` entry (with a
  "Tanpa batas" toggle → -1) and one switch per `FEATURE_KEYS` entry, using
  `LIMIT_META` / `FEATURE_META` labels and hints. Adding a key in code adds a
  field with no UI work.
- Prices are `Decimal(14,2)`; checkout converts to an integer amount.

Public consumers:
- `/api/public/landing` → active + public plans with normalized limits/features
  (pricing table).
- `/api/app/subscription` → active + public plans for the billing page.
- `GET /api/v1/plans` → same for the app.

## 8. Downgrade never deletes data

When a tenant falls below a cap (trial expiry, grace expiry, cancellation end,
admin override):

- Excess **branches are deactivated** (`isActive=false`), oldest-primary kept
  first, and `Tenant.downgradeResolvedAt` is cleared in the same transaction →
  the owner gets a **blocking dialog** to pick which stay active.
- Excess **employees** (active count > `employees` limit): HR is asked to pick
  which stay active; the rest are marked **`inactive_over_limit`** (proposed
  status/flag, distinct from `terminated`). This is a *access/active-count*
  state only: the Employee row, attendance, leave, payroll history and
  **payslips are never deleted or hidden from HR**, and an over-limit employee's
  past payslips stay readable. What stops: new attendance/leave/payroll
  processing for them and their ESS login (membership deactivated, not
  deleted). Reactivation on upgrade restores everything. Until HR chooses, a
  deterministic default keeps the oldest-hired employees active.
- Excess **team members** (owner + hr_admin + manager logins over the limit):
  deactivate newest first, never the owner; the owner may swap in the dialog.
- `storageMb` over the cap: existing files stay; only new uploads are refused.
- Paid features stop working but their data/config is kept; everything comes
  back on upgrade. A payroll run already `paid_recorded` is immutable history
  regardless of plan.
- Write this promise into user-facing copy ("Data Anda tidak dihapus").
- Per-employee pricing (open question in D4) would change only how price is
  computed in checkout; the `employees` limit/gate stays as is.

## 9. Trial guard

- One trial per normalized email via `TrialClaim.emailNormalized` (unique),
  written in the signup transaction, behind setting `billing.oneTrialPerEmail`.
- Trial plan = setting `billing.trialPlanSlug` (proposed `business`); length =
  that plan's `trialDays` (14 for growth/business, 0 for free, per D4).
- A tenant without a trial starts on the free plan with status `downgraded`.
