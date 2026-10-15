# 13 — Front-end: Tenant Console (`/app`) and Shared Client Patterns

Most of this file also applies to `/admin`; differences are noted.

HRIS Nexadream: the tenant is a **Company** ("Perusahaan" in UI), a branch is an
**office / work location**. One console (`/app`) serves two shells chosen by
role (see §5 and §5b): the **management shell** for `owner`, `hr_admin`,
`manager`, and the **employee self-service (ESS) shell** for `employee`.
Roles and presets: `tasks/DECISIONS.md` D3.

## 1. The authenticated HTTP client — `app/utils/api-fetch.ts`

**Every internal API call uses `apiFetch`, never the bare `$fetch`.** Nuxt's
auto-imported `$fetch` is captured from `globalThis.$fetch` at module
evaluation — a plugin that later replaces the global is invisible to every
composable, and no request would carry a token. `apiFetch` resolves its
client lazily on first call.

```ts
export const TENANT_TOKEN_KEY = '{{APP_KEY}}_tenant_token'
export const PLATFORM_TOKEN_KEY = '{{APP_KEY}}_platform_token'
export const PLATFORM_RETURN_TOKEN_KEY = '{{APP_KEY}}_platform_return_token' // never sent

function storageKeyFor(url: string): string | null {
  if (url.startsWith('/api/admin/')) return PLATFORM_TOKEN_KEY
  if (url.startsWith('/api/app/') || url.startsWith('/api/v1/')) return TENANT_TOKEN_KEY
  return null
}

client = globalThis.$fetch.create({
  onRequest   → attach `Authorization: Bearer <token for that audience>` (if not set)
  onResponse  → for successful non-GET calls, notify mutation listeners (cache invalidation by URL topic)
  onResponseError → on 401: remove that audience's token (+ release web push for tenant)
})
// On the server (SSR) apiFetch is just globalThis.$fetch.
export const apiFetch = Object.assign((req, opts) => client()(req, opts), { raw, create })
export function onApiMutation(listener): () => void
```

Error helpers (`usePageState.ts`): `extractErrorMessage(caught, fallback)`
(the product-language `statusMessage`), `extractErrorCode(caught)`,
`extractStatusCode(caught)`.

## 2. Auth composables

`useAuthClient(options)` is one internal factory; `useTenantAuth()` and
`usePlatformAuth()` are thin wrappers with their own options:

```ts
interface AuthClientOptions {
  audience: 'tenant' | 'platform'
  storageKey: string
  loginEndpoint: string         // /api/app/auth/login | /api/admin/auth/login
  logoutEndpoint: string
  profileEndpoint: string       // /api/app/auth/profile | /api/admin/auth/profile
  loginRoute: string            // /app/auth/login | /admin/auth/login
  homeRoute: string             // /app/dashboard | /admin/dashboard
  beforeLogout?: () => Promise<void>   // e.g. unregister push device while token still valid
}
```

State is `useState` keyed by audience (`auth:<audience>:token|profile|tenant|
impersonating|ready`) — one instance shared by every component.

```ts
init()                 // restore token from localStorage on first client render, fetch profile
login({ identifier, password, provider? })
adoptToken(token)      // impersonation, invitation acceptance, OAuth exchange
logout(redirect = true)  // beforeLogout → POST logout → reset → navigate to loginRoute
fetchProfile()         // failure → reset (token dropped)
hasPermission(key|key[])   // platform; superadmin true
hasRole(slug|slug[])
hasAbility(ability)        // tenant; canTenantRole
// exposes: token (readonly), profile, tenant (TenantSummary), impersonating, ready, isAuthenticated
```

`TenantSummary` = `{ id, name, slug, status, logoUrl, timezone,
onboardingCompletedAt, needsBranchSelection, …domain }`. The profile response
also sets the display timezone used by date formatting.

## 3. Route guard — `app/middleware/auth.global.ts`

```ts
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return                     // both consoles are client-only
  const path = to.path
  const isTenant = path.startsWith('/app'), isPlatform = path.startsWith('/admin')
  if (!isTenant && !isPlatform) return
  const isAuthRoute = path.startsWith('/app/auth') || path.startsWith('/admin/auth')

  if (isTenant) {
    const auth = useTenantAuth(); await auth.init()
    if (isAuthRoute) {
      // accept-invite may be opened while signed in (it's for another membership)
      if (auth.isAuthenticated.value && path !== '/app/auth/accept-invite') return navigateTo('/app/dashboard')
      return
    }
    if (!auth.isAuthenticated.value)
      return navigateTo({ path: '/app/auth/login', query: path === '/app' ? undefined : { redirect: path } })
    if (!auth.tenant.value?.onboardingCompletedAt && path !== '/app/onboarding') return navigateTo('/app/onboarding')
    if (auth.tenant.value?.onboardingCompletedAt && path === '/app/onboarding') return navigateTo('/app/dashboard')
    // role employee: ESS only (see §5b)
    if (auth.hasRole('employee') && !isEssAllowedPath(path)) return navigateTo('/app/me')
    return
  }

  const auth = usePlatformAuth(); await auth.init()
  if (isAuthRoute) { if (auth.isAuthenticated.value) return navigateTo('/admin/dashboard'); return }
  if (!auth.isAuthenticated.value)
    return navigateTo({ path: '/admin/auth/login', query: path === '/admin' ? undefined : { redirect: path } })
})
```

Login pages honour `?redirect=` (same-origin paths only).

## 4. Tenant pages (platform part)

| Route | Purpose | Ability |
|---|---|---|
| `/app/auth/login` | email/phone + password; OAuth buttons from `GET /api/app/auth/providers`; explains `?error=` codes | — |
| `/app/auth/register` | name, email, phone, password, accept terms → signed in → onboarding | — |
| `/app/auth/forgot-password`, `/reset-password?token=` | | — |
| `/app/auth/accept-invite?token=` | preview (`GET /api/app/auth/invitation?token`) then accept; password asked only when needed | — |
| `/app/auth/callback?code=&redirect=` | trades the OAuth handoff code (`POST /api/app/auth/exchange`), adopts token | — |
| `/app/onboarding` | blocking setup wizard | `settings.manage` |
| `/app/dashboard` | home. Management roles: HR KPIs (headcount, present today, pending approvals, contracts expiring) + trial/grace banners. Role `employee` is redirected to `/app/me` | any |
| `/app/me` | ESS home (see §5b) | role `employee` (also reachable by other roles for their own data) |
| `/app/billing` | plans, checkout, pending charges, cancel — see `07` §3.2 | `billing.manage` |
| `/app/billing/history` | paged payment history | `billing.manage` |
| `/app/team` | members + invitations, role presets, branch scope (plan-gated) | `team.manage` |
| `/app/branches` | offices CRUD (name, address, timezone WIB/WITA/WIT, geofence) + **blocking "choose active branches" dialog** when `needsBranchSelection` | `branches.manage` |
| `/app/settings` | company settings (legal name, NPWP, payroll/leave/attendance policies) | `settings.manage` |
| `/app/settings/api-keys` | create (show once) / revoke keys | owner + plan `apiAccess` |
| `/app/activity` | tenant-visible audit trail (plan `activityLog`, retention-clamped) | `activity.read` |
| `/app/notifications` | full notification list + push settings | any |
| `/app/profile`, `/app/change-password` | separate pages on purpose (different risk) | any |
| `/app/about` | app info, help links, account deletion entry | any |

HR domain pages (proposed routes; ability keys are proposals, final list lives
in `04-roles-and-permissions.md`). Pages of a paid feature stay visible with a
lock and open `<UpgradeDialog>` instead of navigating:

| Route | Nav section | Purpose | Ability · plan feature |
|---|---|---|---|
| `/app/employees`, `/app/employees/:id` | Karyawan | list (masked NIK/NPWP/salary), profile tabs (personal, job, payroll data, documents) | `employees.read` (sensitive tabs: `employees.read_sensitive`) |
| `/app/employees/import` | Karyawan | CSV/XLSX import | `employees.manage` · `import` |
| `/app/attendance` | Kehadiran | daily board, corrections, monthly recap | `attendance.read` / `attendance.manage` |
| `/app/attendance/shifts` | Kehadiran | shift templates and schedules | `attendance.manage` · `shiftScheduling` |
| `/app/leave` | Cuti | requests, balances, leave types, holiday calendar | `leave.read` / `leave.manage` · `leaveManagement` |
| `/app/overtime` | Lembur | overtime requests and approvals | `overtime.read` · `overtime` |
| `/app/reimbursements` | Reimbursement | claims and approvals | `reimbursement.read` · `reimbursement` |
| `/app/payroll`, `/app/payroll/:periodId` | Payroll | periods, run calculation, review, approve, record as paid (never moves money, D5) | `payroll.manage` · `payroll` |
| `/app/documents` | Dokumen | employee document vault (private files, `16` §1) | `documents.read` · `documentVault` |
| `/app/reports` | Laporan | headcount, attendance, leave, payroll and BPJS/PPh 21 recaps, exports | `reports.read` · `export` for download |
| `/app/team` | Tim & Akses | owner/hr_admin/manager logins, invitations, employee self-service invites | `team.manage` |
| `/app/approvals` | (manager inbox) | pending leave/overtime/reimbursement of direct and indirect reports | `approvals.act` |

## 5. Shell — `layouts/tenant.vue` → `<TenantShell>`

`layouts/tenant.vue` picks the shell by role: `employee` → `<EssShell>` (§5b),
everything else → `<TenantShell>`. `TENANT_NAV` (management shell), in order:

| Section (UI label) | Route | Visible to | Gate |
|---|---|---|---|
| Dashboard | `/app/dashboard` | owner, hr_admin, manager | — |
| Karyawan | `/app/employees` | owner, hr_admin, manager (own team only) | `employees.read` |
| Kehadiran | `/app/attendance` | owner, hr_admin, manager | `attendance.read`; shifts sub-item locked without `shiftScheduling` |
| Cuti | `/app/leave` | owner, hr_admin, manager | `leave.read` · lock if no `leaveManagement` |
| Lembur | `/app/overtime` | owner, hr_admin, manager | `overtime.read` · lock if no `overtime` |
| Reimbursement | `/app/reimbursements` | owner, hr_admin, manager | `reimbursement.read` · lock if no `reimbursement` |
| Payroll | `/app/payroll` | owner, hr_admin | `payroll.manage` · lock if no `payroll` (hidden for `manager`) |
| Dokumen | `/app/documents` | owner, hr_admin | `documents.read` · lock if no `documentVault` |
| Laporan | `/app/reports` | owner, hr_admin, manager (scoped) | `reports.read` |
| Tim & Akses | `/app/team` | owner (hr_admin read-only if allowed) | `team.manage` |
| Pengaturan | `/app/settings` (+ branches, api-keys) | owner, hr_admin | `settings.manage` |
| Langganan | `/app/billing` | owner | `billing.manage` |

Gating rule (MUST): **ability decides visibility, plan feature decides the
lock.** A missing ability hides the item entirely (a manager never sees
Payroll); a missing plan feature shows the item with a lock icon and opens
`<UpgradeDialog>` on click. The server re-checks both on every request — nav
filtering is only a convenience. Managers additionally get an **Approval inbox**
entry (badge = pending count) pointing to `/app/approvals`.

- **Left nav rail** (collapsible, cookie state; `sticky h-dvh`, scrolls
  independently): logo, `<BranchSwitcher>` (if multi-branch), sections from
  `TENANT_NAV` filtered by ability (paid features shown with a lock), rail
  foot = `<UpgradeRailButton>` (hidden when the plan already has everything or
  the role can't buy) + guide/tour launcher + collapse toggle. On phones the
  rail is a slideover and its foot goes in the `#footer` slot (not the
  scrolling body).
- **Top bar** = account chrome only: breadcrumb, `<NotificationMenu>`,
  `<UserMenu>`. `<UserMenu>` is fixed code (not DB), grouped under captions:
  *Akun* (profile, change password), *Perusahaan* (billing, settings, API keys —
  by ability), *Aplikasi* (dark mode, install app, about), sign out. A caption
  with no visible rows is not drawn.
- **Banners**: `<ImpersonationBanner>` (always visible while `impersonating`;
  "stop" → `POST /api/app/auth/stop-impersonation`, drop tenant token, back to
  `/admin`), `<TrialBanner>` (days left / grace deadline, link to billing).
- **`<UpgradeDialog>`** mounted once in the shell, driven by
  `useEntitlements().upgradeDialog` — opened by any caught 402.
- **Page body**: `<CommandBar>` (title, breadcrumb override for dynamic
  segments, primary actions; on phones actions wrap to their own row), then
  content. Create/edit in `<FormSlideover>`; `UModal` only for confirmations
  (`useConfirmDialog()`) and read-only detail.
- Breadcrumbs come from a route catalog (`shared/utils/breadcrumbs.ts`) drawn
  once by `<AppBreadcrumb>` — a new page gets a breadcrumb by adding a catalog
  entry, not markup.

## 5b. Employee self-service (ESS) shell — role `employee`

`<EssShell>` is a lighter, mobile-first layout (bottom tab bar on phones, slim
top bar on desktop). Employees mostly use phones, so design for < 640 px first.
No left rail, no branch switcher, no billing/trial banners, no plan locks
(an employee never buys anything).

| Tab | Route | Content |
|---|---|---|
| Beranda | `/app/me` | greeting, today's shift, **Clock in / Clock out** button (shows branch-local time; geofence/selfie when the plan and branch enable them), leave balance chips, latest payslip shortcut, pending request count |
| Kehadiran | `/app/me/attendance` | own attendance history and correction requests |
| Cuti | `/app/me/leave` | balances, apply for leave, request history |
| Pengajuan | `/app/me/requests` | overtime and reimbursement requests with status (`StatusBadge`), plus leave |
| Slip Gaji | `/app/me/payslips` | list and detail of own payslips (only status `paid_recorded`/approved, never drafts); PDF download via signed URL |
| Profil | `/app/me/profile` | own personal data (masked sensitive fields, edit requests go to HR), documents shared with them, change password |

Rules (MUST):

- ESS endpoints are `/api/app/me/**` and always scoped to the caller's own
  `Employee` row resolved from the session — **never** accept an `employeeId`
  from the client. Salary/identity reads are audit-logged (`16` §2).
- A route guard keeps role `employee` inside `/app/me/**`, `/app/notifications`,
  `/app/profile`, `/app/change-password`, `/app/about`; any other `/app/*`
  path redirects to `/app/me`. Management roles that also have an Employee
  record reach their own data through `/app/me` from the user menu ("Tampilan
  karyawan").
- Clock in/out sends only the action and optional coordinates; the **server**
  decides the timestamp and the branch-local day (`16` §9). A client clock is
  never authority.
- Notifications (approved/rejected, payslip published) reuse `<NotificationMenu>`.

**Manager approvals inbox** (`/app/approvals`, management shell): one list
across leave, overtime and reimbursement requests from direct and indirect
reports, filter by type/status, approve/reject with optional note via
`<FormSlideover>`; approving a request outside the manager's subtree is
rejected server-side. Reimbursement approval by a manager is a recommendation
step if the company configured HR final approval (proposed).

## 6. Shared composables

| Composable | Shape | Notes |
|---|---|---|
| `useTenantAuth` / `usePlatformAuth` | see §2 | `useState` |
| `useEntitlements` | features/limits/usage, `handlePlanError` | `useState`; fetched once per load |
| `useNotifications` | items, unreadCount, markRead, markAllRead | shared by bell + page |
| `useActiveBranch` | `activeBranchId`, branches, `loaded` guard | localStorage, self-healing |
| `usePageState(loader, { isEmpty, immediate })` | `data, status: idle|loading|error|empty|success, execute/refresh` | feeds `<AppLoadingState>`, `<AppErrorState>`, `<AppEmptyState>` |
| `useServerList<T>(endpoint, { limit, filters, immediate, debounceMs, cache })` | `items, page, limit (10), search, total, pageCount, extra, status, refresh` | server pagination; 300 ms debounced search; any filter change resets to page 1; optional per-page cache invalidated by mutation topics |
| `useConfirmDialog` | `confirm({ title, description, confirmLabel, color }) → Promise<boolean>` | one modal instance |
| `useAdminImpersonation` | start/stop all impersonation kinds | the only code that writes impersonation tokens |
| `useDisplayTimezone` | the clock dates render on | set from profile |

## 7. Conventions (MUST)

**Language.** Every visible string in the product language — labels, toasts,
empty states, validation, badges, emails. Never render an enum slug: every
enum has a label map in `shared/utils/status.ts` with its colour, and one
component (`<StatusBadge>`) renders it.

```ts
export const SUBSCRIPTION_STATUS_META = {
  trialing:   { label: 'Trial',               color: 'info' },
  active:     { label: 'Aktif',               color: 'success' },
  past_due:   { label: 'Menunggu pembayaran', color: 'warning' },
  // HR domain maps live here too: LEAVE_REQUEST_STATUS_META, PAYROLL_STATUS_META
  // (draft → approved → paid_recorded), ATTENDANCE_STATUS_META, EMPLOYMENT_STATUS_META
  cancelled:  { label: 'Dibatalkan',          color: 'neutral' },
  downgraded: { label: 'Turun ke paket Free', color: 'neutral' },
  suspended:  { label: 'Ditangguhkan',        color: 'error' }
}
// PAYMENT_STATUS_META, TENANT_STATUS_META, TENANT_ROLE_META, AUDIT_ACTION_LABELS, …
```

**Formatting** (`app/utils/format.ts`, `id-ID`, default `Asia/Jakarta`,
override per branch/display timezone): `formatIDR` → `Rp 25.000`;
`formatDate` → `11 Agustus 2026`; `formatDateTime` → `11 Agustus 2026, 14.30`
(dot as time separator; attendance times carry the branch zone label WIB/WITA/WIT); `formatRelative` → `2 jam lalu`; `formatPhone` stores
`62…`, displays `+62 812-3456-7890`. Month/day names from `Intl`, never
hard-coded.

**Design system.** Nuxt UI v4 components; tokens in `main.css` (`@theme`) and
`app.config.ts`. Small radii, restrained elevation, 100–200 ms ease-out motion,
no parallax/bounce in the consoles. Solid top bars on dense table screens.
**Dark mode is required** (default light; user choice persisted). Every
colour from semantic tokens (`bg-default`, `bg-muted`, `text-muted`,
`ring-default`, …) — never a hex, never `bg-white`/`text-black`. Check both
themes.

**Responsive** at three widths: phone (< 640, drawer nav), tablet (≥ 1024,
two-pane where useful), desktop (≥ 1280, persistent rail). A capped-width page
body (`max-w-4xl`) always has `mx-auto`; dense tables stay full-bleed.

**Nuxt UI pitfalls.** `UTable` row select handler's row is the **second**
argument: `@select="(_e, row) => …"`. A `USelectMenu` option may never have
`value: ''` (throws); use sentinel constants (`SELECT_ALL`, `SELECT_NONE`) and
convert at the boundary. A literal `{{token}}` in a Vue template breaks the
parser — build the braces in script. A focus ring utility applied without
`focus-visible:` draws permanently.

**Rendering performance** (target: cheap Android tablet on a tethered
connection):

- State read by more than one component lives in a **`useState`-backed
  composable**, decided up front — never a `ref` lifted into a parent and
  prop-drilled; a plain `ref` in a composable silently duplicates per
  component.
- Fetch once: guard loaders with a `loaded` flag; hold dependent fetches
  (`immediate: false`) until their input (e.g. active branch) is known.
- Derive with `computed`, never a function called from the template.
- `shallowRef` for big immutable payloads; never `watch(…, { deep: true })` on
  large objects; stable `:key` (ids, never indexes).
- Split independently refreshing regions into child components.
- Debounce server-hitting input at 300 ms.
- Lazy-load heavy, rarely opened chunks (rich-text editor, charts, dialogs).

## 8. Optional: installable console (PWA)

Recommended for HRIS Nexadream (proposed): employees clock in from phones, so
the ESS should be installable. If the console should install to a home screen:

- Manifest is a **server route** (`server/routes/manifest.webmanifest.ts`,
  correct content type), `scope: '/app/'`, `start_url: '/app/dashboard'`,
  `id: '/app/'` (**never change the id** — it orphans installs). Advertised
  only from the tenant layouts, never on `/admin` or the landing site.
- Service worker caches **hashed `/_nuxt/` assets only** — not navigations,
  not `/api/**` (stale business numbers destroy trust; no offline queue).
- Not registered in dev; test install with `build && preview`.
- Capture `beforeinstallprompt` in a client plugin (module variable, not
  `useState` — a Proxy breaks `prompt()`); iOS gets manual instructions.
