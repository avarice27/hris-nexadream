# 04 — Authorization (RBAC)

There are **two distinct systems**. Do not merge them.

| | Platform RBAC (`/admin`) | Tenant RBAC (`/app`, `/api/v1`) |
|---|---|---|
| Who | Our own staff | People inside a customer company (owner, HR admin, manager, employee) |
| Model | `User → Role → RolePermission → Permission` (DB) | `TenantMembership.role` enum + code-defined abilities |
| Granularity | dotted permission keys, editable per role in `/admin/roles` | four fixed role presets, **no** per-user permission matrix |
| Check | `requirePermission(event, key)` / `<Can :permission>` | `requireTenantAbility(event, ability)` / `canTenantRole(role, ability)` |
| Sidebar | DB-driven `Menu` tree, pruned by permission | code-defined `TENANT_NAV`, filtered by ability |

And separately from both: **plan entitlements** (what the tenant *paid for*),
see `06-plans-and-entitlements.md`. Role = 403, plan = 402.

---

## 1. Platform RBAC

### 1.1 Permission catalog — `shared/utils/permissions.ts`

Typed catalog mirroring what the seed writes, so every check is compile-time
checked:

```ts
export const PERMISSIONS = {
  'dashboard': { read: 'dashboard.read' },
  'tenants': { read: 'tenants.read', write: 'tenants.write' },
  'subscriptions': { read: 'subscriptions.read', write: 'subscriptions.write' },
  'plans': { read: 'plans.read', write: 'plans.write' },
  'payments': { read: 'payments.read', write: 'payments.write' },
  'users': { read: 'users.read', write: 'users.write' },
  'roles': { read: 'roles.read', write: 'roles.write' },
  'permissions': { read: 'permissions.read', write: 'permissions.write' },
  'menus': { read: 'menus.read', write: 'menus.write' },
  'settings': { read: 'settings.read', write: 'settings.write' },
  'pages': { read: 'pages.read', write: 'pages.write' },
  'faq': { read: 'faq.read', write: 'faq.write' },
  'messages': { read: 'messages.read', write: 'messages.write' },
  'email-templates': { read: 'email-templates.read', write: 'email-templates.write' },
  'notification-templates': { read: 'notification-templates.read', write: 'notification-templates.write' },
  'scheduled-notifications': { read: 'scheduled-notifications.read', write: 'scheduled-notifications.write' },
  'api-clients': { read: 'api-clients.read', write: 'api-clients.write' },
  'reports': { read: 'reports.read' }   // read-only; carries revenue
} as const

export type PermissionKey = /* union of every leaf value */
export const PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS).flatMap(g => Object.values(g))
export const PERMISSION_GROUP_LABELS: Record<group, string>   // product-language labels
export const PERMISSION_ACTION_LABELS = { read: 'Lihat', write: 'Ubah' }
```

Seed: one `Permission` row per key, `group` = prefix, `description` built from
the action label + group label.

### 1.2 Roles

| Slug | `isSuperAdmin` | Permissions |
|---|---|---|
| `superadmin` | ✓ | all (and bypasses every `requirePermission`) |
| `admin` | | all except `roles.write`, `permissions.write`, `menus.write` (cannot widen own access) |
| `support` | | every `*.read` except `reports.read`, plus `messages.write` |

All three are `isSystem: true`. Rules enforced by the API:

- `isSystem` roles cannot be deleted; their `slug` cannot change.
- The superadmin role's permissions cannot be edited (409).
- A role with users cannot be deleted (409 "move its users first").
- Editing a role's permissions replaces the `role_permissions` set inside a
  transaction, ignores unknown keys, and writes audit `permission.update`.

`Role.isSuperAdmin` gates: impersonation, tenant hard actions (delete), and is
the only role allowed to create other superadmins.

### 1.3 DB-driven sidebar — `Menu`

- Self-referential tree, deterministic ids `menu-{slug}`.
- `parentId === null && path === null` → **section header**.
- An item with children and no `path` → **disclosure group** (third level).
  **Max depth 3.** The menu editor must render every level it allows, because
  the self-relation cascades on delete.
- A group carries no `permissionKey`; children gate themselves.
- `GET /api/admin/auth/menus` returns the tree pruned to the caller:

  ```ts
  const allowed = (key: string | null) => !key || isSuperAdmin || permissions.has(key)
  function build(parentId) {
    return rows(parentId)
      .filter(r => allowed(r.permissionKey))
      .map(r => ({ id, label, slug, path, icon, children: build(r.id) }))
      .filter(n => n.path !== null || n.children.length > 0)   // drop empty groups
  }
  ```

- Fixed chrome (not DB rows): Dashboard, Reports (if `reports.read`),
  notifications, profile, change password, logout.
- Open/closed state of a disclosure group is a single `useState` boolean (the
  rail is mounted twice: desktop aside + mobile drawer). Landing on a page
  inside a group *writes* that state open — never compute it as
  `open || containsCurrentPage` (makes the toggle stop working).

Default tree (`shared/utils/menus.ts` → `MENU_TREE`):

```
Bisnis (business)
  Daftar bisnis      /admin/tenants              tenants.read
  Langganan          /admin/subscriptions        subscriptions.read
  Paket              /admin/plans                plans.read
  Pembayaran         /admin/payments             payments.read
  Payment gateway    /admin/payment-gateways     payments.write
  Payment callback   /admin/webhook-events       payments.read
Konten (content)
  Halaman            /admin/pages                pages.read
  FAQ                /admin/faq                  faq.read
  Pesan masuk        /admin/messages             messages.read
  Templat email      /admin/email-templates      email-templates.read
  Templat notifikasi /admin/notification-templates notification-templates.read
  Notifikasi terjadwal /admin/scheduled-notifications scheduled-notifications.read
Akses (access)
  Pengguna (group)
    Management       /admin/users                users.read
    Tenant users     /admin/tenant-users         tenants.read
  Peran              /admin/roles                roles.read
  Hak akses          /admin/permissions          permissions.read
  Menu               /admin/menus                menus.read
  API Key            /admin/api-clients          api-clients.read
Sistem (system)
  Pengaturan         /admin/settings             settings.read
  Log aktivitas      /admin/audit-logs           settings.read
```

Menu admin endpoints: `GET/POST /api/admin/menus`, `PATCH/DELETE
/api/admin/menus/:id` (delete refused while it has children),
`POST /api/admin/menus/reorder { items: [{ id, order, parentId }] }` (one
transaction).

### 1.4 Client

- `usePlatformAuth().hasPermission(key | key[])` — superadmin always true.
- `<Can :permission="PERMISSIONS.tenants.write">…</Can>` hides UI. The server
  check is the boundary; the component is convenience.

---

## 2. Tenant RBAC — deliberately small

### 2.1 Roles and abilities — `shared/utils/tenant-abilities.ts`

Imported identically by server and client.

```ts
export type TenantRoleSlug = 'owner' | 'hr_admin' | 'manager' | 'employee'   // D3

export type TenantAbility =
  // — platform/account layer (generic)
  | 'billing.manage'          // subscription, checkout, payments
  | 'branches.manage'         // offices / work locations
  | 'settings.manage'         // company settings, onboarding, work calendar, leave policy
  | 'account.manage'          // data export, deletion request
  | 'team.manage'             // invite / deactivate owner-hr_admin-manager logins + ESS invites
  | 'activity.read'           // tenant-visible audit trail
  | 'reports.read'
  // — employee master
  | 'employees.read'          // directory + non-sensitive fields (masked NIK/NPWP/BPJS/bank/salary)
  | 'employees.write'         // create / edit / deactivate employees, org structure
  | 'employees.sensitive.read'// unmasked NIK, NPWP, BPJS, bank account, family data (audit-logged, D7)
  // — attendance
  | 'attendance.read'         // everyone's attendance within scope
  | 'attendance.write'        // correct / approve attendance, manage shifts and schedules
  | 'attendance.self'         // own clock in/out + own history
  // — leave
  | 'leave.read'              // leave requests/balances within scope
  | 'leave.write'             // HR: manage leave types, balances, adjust on behalf
  | 'leave.approve'           // approve/reject requests (also overtime/reimbursement approval steps)
  | 'leave.self'              // request own leave, see own balance
  // — overtime & reimbursement
  | 'overtime.approve' | 'overtime.self'
  | 'reimbursement.approve' | 'reimbursement.self'
  // — payroll
  | 'payroll.read'            // payroll runs + any employee's payslip (salary data, audit-logged)
  | 'payroll.write'           // calculate, edit components, approve, mark paid_recorded
  | 'payslips.read.own'       // own payslips only
  // — documents & performance
  | 'documents.read' | 'documents.write'   // company document vault + employee documents
  | 'documents.self'          // own documents / company policies
  | 'performance.read' | 'performance.write' | 'performance.self'
  | 'self.profile'            // edit own non-sensitive profile fields

const ABILITIES: Record<TenantRoleSlug, TenantAbility[]> = {
  owner:    [/* everything */],
  hr_admin: [/* every HR ability (employees.*, attendance.*, leave.*, overtime/reimbursement.approve, payroll.*, documents.*, performance.*, reports.read) + settings.manage + branches.manage;
               NO billing.manage, account.manage, and team.manage limited to inviting employees/ESS — proposed */],
  manager:  [/* employees.read (non-sensitive), attendance.read, leave.read, leave.approve, overtime.approve, reimbursement.approve,
               performance.read/write for reports, reports.read (own scope) + ALL *.self abilities; NO payroll.*, NO employees.sensitive.read */],
  employee: [/* only the self abilities: attendance.self, leave.self, overtime.self, reimbursement.self,
               payslips.read.own, documents.self, performance.self, self.profile */]
}

export function canTenantRole(role, ability): boolean
export function abilitiesFor(role): TenantAbility[]

export const TENANT_ROLE_PRESETS = {
  owner:    { label: 'Pemilik',          summary: 'Akses penuh, termasuk langganan, pembayaran, dan penghapusan perusahaan.', icon: 'i-lucide-crown' },
  hr_admin: { label: 'Admin HR',         summary: 'Mengelola karyawan, absensi, cuti, dan penggajian. Tidak bisa mengakses langganan.', icon: 'i-lucide-user-cog' },
  manager:  { label: 'Atasan / Manajer', summary: 'Menyetujui cuti dan lembur serta melihat absensi bawahan. Tidak bisa melihat gaji.', icon: 'i-lucide-users' },
  employee: { label: 'Karyawan',         summary: 'Layanan mandiri: profil, absensi, cuti, dan slip gaji milik sendiri.', icon: 'i-lucide-user' }
}

// Dapat dipilih di form undangan tim (menghabiskan seat teamMembers):
export const ASSIGNABLE_TENANT_ROLES: TenantRoleSlug[] = ['hr_admin', 'manager']
// Karyawan TIDAK diundang dari halaman tim, tetapi dari rekam karyawan (ESS) — lihat 03 §7.1.
export const ESS_TENANT_ROLE: TenantRoleSlug = 'employee'
```

The ability list above is **proposed**; add domain abilities as phases land,
but keep the naming `<domain>.<read|write|approve|self>`. An ability that
reveals personal data under D7 (`employees.sensitive.read`, `payroll.read`)
is never implied by a broader one and every read is audit-logged.

Rules:

- **Owner**: exactly one per tenant (company), created with the company. Not
  assignable and not editable from the team page; ownership transfer is a
  separate, deliberate feature (not built).
- **Seats**: owner + `hr_admin` + `manager` logins consume `teamMembers`;
  `employee` logins do not (the `employees` limit counts active Employee
  records — see `06`).
- A person who is both a manager and an employee is **one login, one role**
  (`manager`); the `*.self` abilities are included in `manager`, `hr_admin` and
  `owner` so they can also use their own ESS pages.
- **Presets, never a permission matrix.** The invite form shows one card per
  role with a plain-language sentence. If per-member exceptions are ever
  needed, add an **additive** `abilityOverrides` JSON column — never
  subtractive, never covering `billing.manage`.
- `activity.read` stays owner-only (proposed: also `hr_admin` when not
  branch-scoped) while `AuditLog` has no `branchId` (otherwise a branch-scoped
  manager would see other branches' activity).
- Name it `canTenantRole`, not `can`, because the entitlements module exports
  `can(tenantId, feature)` and both are auto-imported.

### 2.2 Branch scoping — no rows means every branch

`TenantMembershipBranch` restricts a member to specific branches (offices). **An
empty set means all branches** — that is what the owner and every company on a
plan without `branchScopedRoles` looks like. An empty array can therefore never
lock someone out by accident.

Enforced server-side in exactly three ways:

```ts
context.branchIds                 // string[] | null — null = unrestricted
branchScopeWhere(context)         // spread into Prisma where: { tenantId, ...branchScopeWhere(ctx) }
requireBranchAccess(event, id)    // 404 for another tenant's branch AND for out-of-scope
```

Out-of-scope answers **404, not 403**: a delegated login must not learn that a
branch it cannot see exists. A branch-scoped member never gets a
whole-business rollup report — fall back to one of their own branches.

When the plan lacks `branchScopedRoles`, `resolveBranchScope()` (team util)
**drops** the requested scope and stores none (member gets every branch).

### 2.2.1 Manager scope = own reports + branch scope (proposed)

A `manager` sees HR data only for **their reports**, intersected with their
branch scope:

```ts
context.reportIds                       // string[] — Employee ids of direct + indirect reports
                                        // (walk Employee.managerId; cycle-safe, depth-capped)
reportScopeWhere(context)               // { tenantId, ...branchScopeWhere(ctx), employeeId: { in: reportIds } }
requireEmployeeAccess(event, employeeId)// 404 when the employee is outside the caller's scope
```

- Applies to `attendance.read`, `leave.read`, `leave.approve`,
  `overtime.approve`, `reimbursement.approve`, `performance.*`, and the
  `employees.read` directory for a manager. Approving a request of someone
  outside the scope → **404**, same as an out-of-scope branch.
- `reportIds` is computed per request from `Employee.managerId` (no cached
  state across instances) — serverless-safe.
- Managers never approve their **own** request: approval routes reject
  `request.employeeId === context.employeeId` (409); it escalates to their own
  manager or `hr_admin`/`owner`.
- `owner` and `hr_admin` are not report-scoped (they are only branch-scoped when
  the plan has `branchScopedRoles` and rows exist).
- A manager's department-level rollups (headcount, attendance rate) contain
  aggregates of their scope only — never company-wide numbers.

### 2.2.2 Own-record (self) scope for employees

Every `*.self` / `payslips.read.own` ability means "my own rows only":

- The handler derives `employeeId` from the session
  (`membership → Employee.tenantUserId`) via `requireOwnEmployee(event)` and
  puts it in `where`. A client-supplied `employeeId` on a self endpoint is
  **ignored** (or 400), never trusted.
- Another person's record → **404**, not 403 (same rule as branches).
- Routes live under `/api/app/me/**` (and `/api/v1/me/**`) so a self endpoint
  can never be mistaken for an HR-wide one.
- Self access covers only non-sensitive profile fields for writes
  (`self.profile`: phone, address, emergency contact, photo; changes to NIK,
  bank account, name, etc. go through an HR-approved change request).
  Reading **own** sensitive data (NIK/NPWP/bank, payslips) is allowed to the
  employee but still audit-logged and masked by default.
- Owner/hr_admin/manager have the `*.self` abilities too, but the same
  own-record rule applies on `/me/**`.

### 2.3 Client

- `useTenantAuth().hasAbility(ability)` — same `canTenantRole` function.
- `TENANT_NAV` (code-defined, small, stable):

  ```ts
  export interface TenantNavItem {
    label: string; to: string; icon: string
    ability?: TenantAbility      // hides the entry when the role lacks it
    feature?: FeatureKey         // NEVER hides; shows a lock, page opens upgrade dialog
  }
  ```

  Billing, settings, API keys and profile are **account chrome** in the user
  menu, not rail entries. The `employee` role gets a separate, minimal ESS nav
  (`Beranda`, `Absensi`, `Cuti`, `Slip Gaji`, `Dokumen`, `Profil`) — all pointing
  at `/app/me/**`.

### 2.4 Narrowest abilities for employee tokens

`employee` holds **only** `*.self`, `payslips.read.own` and `self.profile`.
It has no `employees.read`, so the employee directory, colleagues' attendance,
company reports and billing are all 403 by construction. Test this with a
role × ability matrix unit test (`canTenantRole('employee', x)` is true only for
the self list).

---

## 3. Gatekeeper decision table

| Situation | Use | Status |
|---|---|---|
| No / invalid token | any `require*` | 401 `UNAUTHENTICATED` |
| Wrong audience token | `requirePlatformContext` / `requireTenantContext` | 403 `FORBIDDEN` |
| Staff lacks permission | `requirePermission` | 403 `FORBIDDEN` |
| Tenant role lacks ability | `requireTenantAbility` | 403 `FORBIDDEN` |
| Impersonated session tries to pay | `requireNotImpersonating` | 403 `FORBIDDEN` |
| Branch of another tenant / out of scope | `requireBranchAccess` | 404 `NOT_FOUND` |
| Employee outside manager's reports / someone else's record on a self route | `requireEmployeeAccess` / `requireOwnEmployee` | 404 `NOT_FOUND` |
| Sensitive HR read (NIK, salary, bank) without ability | `requireTenantAbility` | 403 `FORBIDDEN` (+ audit on allowed reads) |
| Plan lacks feature | `requireEntitlement` | 402 `PLAN_REQUIRED` |
| Plan cap reached | `assertWithinLimit` | 402 `LIMIT_REACHED` |
| Tenant suspended | `requireTenantContext` | 403 `TENANT_SUSPENDED` |
| Tenant deleted | `requireTenantContext` | 403 `TENANT_DELETED` |

Order inside a util: **role check first, then plan check** (so a manager gets
403 on payroll rather than being shown an upgrade offer they can't act on).
