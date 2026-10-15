# 09 — Platform Back-office (`/admin`)

The back-office is how our own staff run the platform: companies (tenants),
subscriptions, plans, payments, gateway credentials, content, templates,
broadcasts, staff accounts, roles, menus and global settings — **all without a
redeploy**. In HRIS Nexadream UI wording a tenant is a **Perusahaan**
(company), a branch is a **Kantor/Cabang**; identifiers stay `tenant` / `branch`.

## 0. Platform staff and employee data (HRIS rule, MUST — D7)

Our staff run the platform, **not** the customers' HR. Therefore:

- Platform staff **never** see employee personal data by default: NIK, NPWP,
  BPJS numbers, bank account, salary/payslips, family data, contracts and
  documents. Admin screens show **counts and metadata only** (e.g. "37 of 50
  employees"), never rows of the `employees` / `payroll_*` / `documents`
  domain tables. The optional `GET …/:id/<domain>` drill-down (§2.2) is
  therefore limited to non-sensitive aggregates and is **off by default**.
- Impersonation (`/impersonate`) opens `/app` as the company owner. While
  impersonating, **sensitive-field reads are blocked regardless of the
  owner's own abilities**: salary, payslips, NIK/NPWP/BPJS/bank numbers and
  documents return masked values / 403 `FORBIDDEN` — unless the staff role
  holds the explicit permission `impersonation.viewSensitive` (proposed;
  held by nobody in the seed, superadmin included, until the owner decides).
  Billing is read-only (existing rule); payroll approval/payment actions are
  blocked.
- Every impersonation is audited: `impersonation.start` / `impersonation.stop`
  with staff id, tenant id, reason (mandatory free text, ≥ 10 chars, or a
  support ticket id), IP; every request made under it carries
  `impersonatorId` in the audit row; a sensitive read made with
  `impersonation.viewSensitive` additionally writes
  `impersonation.sensitive_read` (field group, record id — never the value).
  Sessions are short (30 min, no refresh).
- **Proposed** extra permission keys (code constants; seeded into roles by
  hand): `impersonation.use` (replaces "superadmin only" for start/stop;
  default superadmin + `support_lead`), `impersonation.viewSensitive`,
  `reference-data.read` / `reference-data.write` (statutory rates, see
  `10` §9), `hr-defaults.read` / `hr-defaults.write` (default leave policy
  templates, see `10` §9). Existing keys are unchanged.

- SPA (`ssr: false`), layout `admin.vue` → `<AdminShell>`; auth pages use
  `auth-admin.vue`.
- Token: platform audience (`{{APP_KEY}}_platform_token`). No public sign-up;
  staff are invited.
- UI language: the product language (staff are local). A **closed** list of
  English labels is allowed where the local word reads unnatural (e.g.
  "Payment gateway", "Payment callback", "Support", "Management", "Tenant
  users", "Impersonate", "Trial", "Test environment" badge). Adding to the
  list is a product decision.
- Not installable as a PWA; not used by the mobile app; desktop-first.

## 1. Shell

- **Left rail** (collapsible, state in a cookie): fixed items at top
  (Beranda → `/admin/dashboard`, Laporan → `/admin/reports` if `reports.read`),
  then the **DB-driven menu tree** from `GET /api/admin/auth/menus` (skeleton
  while loading), app version in the footer.
- **Top bar**: breadcrumb (from a route catalog), greeting on the dashboard,
  "Test environment" badge when `appEnv !== 'production'`,
  `<NotificationMenu>` (bell), `<UserMenu>` (profile, change password, dark
  mode, sign out).
- `<AdminImpersonationBanner>` while impersonating another staff member.
- Page body: `<CommandBar>` with title + primary actions; dense,
  server-paginated tables; `<FormSlideover>` (right panel) for create/edit;
  `UModal` only for confirmations and read-only details.

## 2. Screen-by-screen

Each row: page → endpoints → permission → what it does and the rules behind
it.

### 2.1 Overview

| Page | Endpoints | Permission | Content |
|---|---|---|---|
| `/admin/dashboard` | `GET /api/admin/dashboard` | `dashboard.read` | Companies (tenants) total/active/suspended/new this month; total active employees across the platform (a count only); subscriptions by status; revenue this month (sum of `paid` payments by `paidAt`); unread contact messages; 6 newest tenants (with plan/status); 6 latest payments (30 d); new tenant users per month (last 6 months, UTC buckets). Never shows a tenant's domain data. |
| `/admin/reports` | `GET /api/admin/reports/summary?period=day\|week\|month&limit≤60` | `reports.read` | Platform-wide, aggregate only, one clock (platform timezone). Per bucket: revenue, payment count, new paid, renewals, churned, trials lapsed, signups, onboarded, active tenants, domain activity totals. Totals + average payment; revenue by plan and by period; **current book**: MRR (monthly at price, yearly ÷ 12), paying, trialing, past due, by plan; conversion of signups in window; `historySince` (the day `subscription_events` began — earlier churn is "unknown", not zero). Usage section from `usage_daily` (device-days, labelled as such). |
| `/admin/notifications` | `GET /api/admin/notifications`, `POST …/:id/read`, `POST …/read-all` | any staff | The staff member's own bell (e.g. new tenant, new contact message, deletion request). |

### 2.2 Companies (Perusahaan)

| Page | Endpoints | Permission | Content / rules |
|---|---|---|---|
| `/admin/tenants` | `GET /api/admin/tenants?page&limit&search&status&planSlug&subscriptionStatus&deleteRequested&sort&order` | `tenants.read` | Excludes soft-deleted. Search name/phone/email. Shows plan, subscription status, trial/period end, branch count, deletion-request flag. |
| `/admin/tenants/:id` | `GET /api/admin/tenants/:id` | `tenants.read` | Company profile, subscription + plan, **effective entitlements**, **usage vs limit** as meters (employees `37 / 50`, branches, team members = owner+hr_admin+manager+pending invites, storage MB; `-1` shows "Tak terbatas"), enabled features, branches (name, timezone, active), team logins (last login, active; **no employee list**), last 10 payments, counts, deletion request (who/when/reason from the audit row). Never any employee PII or salary (§0). |
| ″ actions | `POST …/:id/suspend {reason}` | `tenants.write` | see `05` §7 |
| | `POST …/:id/reinstate` | `tenants.write` | |
| | `POST …/:id/plan {planSlug, period, status, currentPeriodEnd?, note?}` | `subscriptions.write` | audited override, writes `SubscriptionEvent('admin_override')`, then `enforceBranchLimit` |
| | `DELETE …/:id` | superadmin | soft delete + owner notified |
| | `POST …/:id/impersonate {reason}` | `impersonation.use` (superadmin by default; not while impersonating) | opens `/app` as the owner in a new context; banner; billing read-only; sensitive fields blocked/masked, mandatory reason, audited — see §0 |
| | `GET …/:id/<domain>` | `tenants.read` | optional support drill-down; **aggregates only** (counts by status, last attendance sync time) — never employee rows or salary |
| `/admin/subscriptions` | `GET /api/admin/subscriptions` | `subscriptions.read` | All subscriptions, filters by status/plan, trial end, period end, grace end. |
| `/admin/plans` | `GET/POST /api/admin/plans`, `PATCH/DELETE /api/admin/plans/:id` | `plans.read` / `plans.write` | Plan editor: name, slug, description, monthly/yearly price, trial days, active, public, order, one field per limit key (with unlimited toggle = `-1`) and one switch per feature key, both rendered from the key lists, no UI change for a new key. Limit keys: `employees`, `branches`, `teamMembers`, `reportRetentionDays`, `storageMb`. Feature keys (`FEATURE_KEYS`, D4): `leaveManagement`, `shiftScheduling`, `attendanceGeofence`, `overtime`, `reimbursement`, `payroll`, `performanceReview`, `documentVault`, `export`, `import`, `multiBranchRollup`, `branchScopedRoles`, `customApprovalFlows`, `activityLog`, `apiAccess`, `prioritySupport`. Group the switches in the form (Absensi & cuti, Penggajian, Dokumen, Integrasi, Dukungan). Warn before saving a limit **below** a company's current usage (existing companies keep data; enforcement per `05`/`06`). See `06` §7. |
| `/admin/payments` | `GET /api/admin/payments` | `payments.read` | Every subscription payment: order id, gateway order id, tenant, plan, period, amount, status (+ raw status), type, paid at, created. Filters + search. |
| `/admin/payment-gateways` | `GET /api/admin/payment-gateways`, `PATCH …/:id` | read: `payments.read`; edit: `payments.write` | One card per seeded gateway, form fields from the provider catalog; secrets masked; activation validates required fields; exactly one active. See `08` §9. |
| `/admin/webhook-events` | `GET /api/admin/webhook-events`, `POST …/:id/replay` | `payments.read` / `payments.write` | Callback log: provider, gateway order id, provider's status word, processed at, error, replay count, payload viewer. Replay button. |

### 2.3 Content (Konten)

| Page | Endpoints | Permission | Content / rules |
|---|---|---|---|
| `/admin/pages` | `GET/POST /api/admin/pages`, `GET/PATCH/DELETE …/:id` | `pages.*` | CMS pages (privacy, terms, payment policy, help center, any custom). Fields: slug (unique, 409), title, rich-text content (TipTap, lazy), excerpt, meta title/description, published. Public at `/page/:slug`; `/privacy` and `/terms` render the rows with those slugs. |
| `/admin/faq` | `GET/POST /api/admin/faq`, `PATCH/DELETE …/:id` | `faq.*` | Question, answer, category, order, active. Landing page reads active rows ordered. |
| `/admin/messages` | `GET /api/admin/messages`, `PATCH …/:id {status}`, `DELETE …/:id` | `messages.*` | Contact-form inbox. Status `new → read → replied → archived`; `handledAt` set on first non-new status, cleared when set back to `new`. |
| `/admin/email-templates` | `GET /api/admin/email-templates`, `PATCH …/:id`, `POST …/preview` | `email-templates.*` | Edit subject + HTML body with `{{token}}` placeholders; variable palette from the template's `variables` (label + sample); **live preview** renders tokens with samples inside the brand wrapper; toggle active (inactive → the code catalog fallback is *not* used; the email is skipped). Keys are fixed (created by seed/migration), not creatable. |
| `/admin/notification-templates` | `GET …`, `PATCH …/:id` | `notification-templates.*` | Edit title, body, action label/URL, icon, level, active for in-app/push notifications. |
| `/admin/scheduled-notifications` | `GET/POST …`, `PATCH/DELETE …/:id` | `scheduled-notifications.*` | Broadcast push to every device at a fixed slot. See `11` §6. Sent rows are history (no edit/delete); editing a failed row reschedules it. |

### 2.4 Access (Akses)

| Page | Endpoints | Permission | Content / rules |
|---|---|---|---|
| `/admin/users` ("Management") | `GET/POST /api/admin/users`, `PATCH/DELETE …/:id`, `POST …/:id/impersonate` | `users.*` | Staff list. **Invite** (email, name, role) → `user_invitation` email, 7-day link to `/admin/auth/accept-invite` where they set name + password. Edit name/phone/role/active. You cannot deactivate yourself or change your own role (409). Only a superadmin may grant the superadmin role or delete a superadmin (403). Delete = deactivate (`isActive=false`). Role change audited `role.update`. Impersonate another staff member (superadmin only; never another superadmin, never yourself). |
| `/admin/tenant-users` ("Tenant users") | `GET /api/admin/tenant-users`, `POST …/:id/impersonate {tenantId?, reason}`, `GET …/:id/devices`, `POST …/:id/push` | `tenants.read` (impersonate: `impersonation.use`; push: superadmin) | Every tenant login across all companies: name, email, phone, company(ies), role (`owner` / `hr_admin` / `manager` / `employee`), last login/seen, active. Phone/email of `employee`-role logins are masked in the list (D7). Impersonate a specific login under the §0 rules (impersonating an `employee` login never exposes that person's salary/ID data). List their push devices; **send a test push** (`sendDirectPush`, waits for FCM, writes no notification row). |
| `/admin/roles` | `GET/POST /api/admin/roles`, `PATCH/DELETE …/:id` | `roles.*` | Role name, slug, description, permission checklist grouped by `PERMISSION_GROUP_LABELS` with `Lihat`/`Ubah` columns. Rules in `04` §1.2. |
| `/admin/permissions` | `GET /api/admin/permissions` | `permissions.read` | Read-only catalog of permission keys, groups, descriptions, and which roles hold each. (Keys are code; they are not created here.) |
| `/admin/menus` | `GET/POST /api/admin/menus`, `PATCH/DELETE …/:id`, `POST …/reorder` | `menus.*` | Edit the sidebar tree: label, slug, path, icon, permission key, parent, order, active. Drag to reorder (one transaction). Must render all three levels. Delete refused while it has children. |
| `/admin/api-clients` | `GET /api/admin/api-clients`, `DELETE …/:id` | `api-clients.*` | Every tenant's API keys (prefix, scopes, last used, active). Revoke = `isActive=false`, `revokedAt=now`. Keys are created by tenants themselves. |

### 2.5 System (Sistem)

| Page | Endpoints | Permission | Content / rules |
|---|---|---|---|
| `/admin/settings` | `GET /api/admin/settings`, `PATCH /api/admin/settings {values}`, `POST /api/admin/settings/test-email {to}` | `settings.read` / `settings.write` | The whole platform configuration, grouped tabs rendered from the settings catalog. See `10-platform-settings.md`. |
| `/admin/reference-data` (proposed) | `GET /api/admin/reference-data/:set`, `PUT …/:set/:id` | `reference-data.read` / `reference-data.write` | Versioned statutory reference sets (PPh 21 TER tables, BPJS rates, UMK, PTKP, public holidays). Each row has `effectiveFrom`; edits create a new version, never overwrite; audited `reference_data.update`. See `10` §9. |
| `/admin/audit-logs` | `GET /api/admin/audit-logs?search&action&audience&range\|dateFrom&dateTo` | `settings.read` | Every audit row (both audiences; includes tenant-side reads of NIK/salary fields, D7 — metadata holds field group + record id, never the value): time, actor (+ "via impersonate" when `impersonatorId`), tenant, action label (from `AUDIT_ACTION_LABELS`), target, metadata, IP, user agent. Range presets resolved server-side on the platform clock. |

### 2.6 Account chrome (every staff member)

| Page | Endpoints |
|---|---|
| `/admin/profile` | `GET /api/admin/auth/profile`, `PATCH /api/admin/profile` (name, phone, avatar), `POST /api/admin/uploads` (avatar, ≤ 50 KB) |
| `/admin/change-password` | `POST /api/admin/change-password` (separate page from profile on purpose) |
| `/admin/auth/*` | `POST /api/admin/auth/login`, `logout`, `forgot-password`, `reset-password`, `accept-invite`, `stop-impersonation` |

## 3. How an admin typically operates the platform

1. **First deploy**: sign in as the seeded superadmin → change password →
   `/admin/settings`: company identity, SMTP (then "send test email"), billing
   rules, privacy numbers, app flags, HR defaults → `/admin/reference-data`:
   check statutory rates are current → `/admin/payment-gateways`: enter the
   hub API key, base URL, order prefix (`HRN`) → activate → `/admin/plans`: set real
   prices/limits/features → `/admin/pages` + `/admin/faq`: legal and help
   content → `/admin/email-templates`: review copy → `/admin/users`: invite
   staff with `admin` / `support` roles.
2. **Daily**: dashboard → messages inbox → payments + webhook events (any
   errors? replay) → tenants with deletion requests.
3. **Support case**: find the company (`/admin/tenants`) or the login
   (`/admin/tenant-users`) → read detail → prefer asking the company's
   `owner`/`hr_admin` to screen-share; impersonate only if needed (reason
   required, read-only billing, sensitive fields blocked, §0) → stop
   impersonating.
4. **Commercial change**: edit a plan (takes effect within the 60 s
   entitlement cache), or override one tenant's plan with a note.
5. **Incident**: turn on `app.maintenanceMode` with a message; close
   registration via `app.registrationOpen`; raise
   `app.minimumMobileVersion` to force app updates.

## 4. List endpoint shape (admin)

Admin list endpoints return `{ items, meta: { page, limit, total, pageCount } }`
(not the v1 envelope) and accept the shared `parseListQuery` params
(`page`, `limit ≤ 100`, `search`, `sort`, `order`, `dateFrom`, `dateTo`,
`isActive`) plus their own filters. Tables are always server-paginated; the
count shown is `meta.total`.
