# 17 — Implementation Plan

For HRIS Nexadream (`web/hris-nexadream/`, Vercel serverless). Decisions already
made live in `../tasks/DECISIONS.md`; progress is tracked in `../tasks/`.

A build order that keeps every step runnable. Each phase ends with lint clean,
typecheck of changed files clean, and the flow exercised in the browser.

## Phase 0 — Decisions still open for HRIS

D1-D9 in `tasks/DECISIONS.md` already fix identity, roles, plans/limits, money
rules, scope, sensitive data and hosting (all **Proposed** until the owner
confirms). Ask the owner these together, with concrete options, before the
phases that depend on them:

1. **Per-employee pricing**: flat tiers (current D4) or a base price + IDR X per
   employee per month? Blocks Phase 7 billing.
2. **Payroll scope**: how far does v1 go (PPh 21 TER only, BPJS, THR, custom
   allowances/deductions, payslip PDF, bank export file)? Blocks Phase 11
   payroll. Confirm that out-of-scope items (D6) stay out.
3. **Domain and support email**: confirm `https://hris.nexadream.id` and
   `support@nexadream.id`.
4. **Payment Hub**: platform API key, base URL, and the **issued order prefix**
   (proposed `HRN`; local prefix `HR`) from the hub admin.
5. **Mobile**: is an employee mobile app (clock-in, leave) planned soon? It
   decides how much `/api/v1` to build now; D9 says out of scope for now.
6. **Sign-in methods**: email/phone + password only, or also Google?
7. **Storage provider** (Supabase or S3-compatible) for the document vault and
   payslip files, and push (FCM) yes/no.
8. **Confirm D2-D4**: tenant = Company, role presets, plan limits/features and
   prices (all placeholders until confirmed).

## Phase 1 — Skeleton

- Nuxt 4 + Nuxt UI v4 + ESLint config; `routeRules` for `/app/**` and
  `/admin/**`; `nitro.errorHandler`.
- Prisma 7 with `prisma.config.ts` + pg adapter client (`server/utils/prisma.ts`).
- `.env.example` (see `01` §5).
- Shared catalogs stubs: `status.ts`, `plans.ts`, `permissions.ts`,
  `tenant-abilities.ts`, `menus.ts`, `settings.ts`, `templates.ts`,
  `payments.ts`.
- `server/utils/validate.ts`, `api-response.ts`, `crypto.ts`, `rate-limit.ts`.
- Layouts: `public`, `tenant`, `auth-tenant`, `admin`, `auth-admin`; design
  tokens + dark mode.
- `CHANGELOG.md` `## 0.1.0 (Draft)`, project `CLAUDE.md` with these rules.

## Phase 2 — Schema & seed

- Full platform schema from `02-database-schema.md` (+ placeholders for
  domain). First migration.
- Idempotent seed: permissions, roles, menus, settings, email + notification
  templates, plans, gateway rows, pages, FAQ, first superadmin (+ demo tenant
  for dev).

## Phase 3 — Auth & RBAC

- `server/services/auth/*` (types, facade, credentials, handoff, JWT driver).
- Gatekeepers in `server/utils/auth.ts`.
- Admin: login/logout/profile/menus, forgot/reset, accept-invite.
- Tenant: register (`registerOwner`), login, logout, profile, forgot/reset.
- Client: `apiFetch`, `useAuthClient` + two wrappers, global middleware,
  login/register pages, both shells with rail + top bar + user menu.
- Audit log + `recordAudit` for sign-ins.

## Phase 4 — Settings, email, notifications

- `server/utils/settings.ts`; `/admin/settings` + test email.
- `server/utils/email.ts` + brand wrapper; templates catalog + renderer.
- `createNotification`, `notifyPlatform`, channels (email; push optional),
  bell endpoints for both audiences, `useNotifications`, notification pages.
- `/admin/email-templates` (+ preview), `/admin/notification-templates`.

## Phase 5 — Tenancy

- Onboarding (server + blocking page).
- Team: invite / revoke / update / accept (+ preview), `/app/team`,
  accept-invite page.
- Branches (if kept) + `useActiveBranch` + `<BranchSwitcher>`.
- Tenant settings page; profile + change password (both audiences); uploads.
- Account export + deletion request; `/hapus-akun` public page.

## Phase 6 — Plans & entitlements

- `server/utils/entitlements.ts`, `requireEntitlement`, `assertWithinLimit`.
- `GET /api/app/entitlements`, `useEntitlements`, `<UpgradeDialog>`,
  `<TrialBanner>`, `<UpgradeRailButton>`, locked nav entries.
- `/admin/plans` editor.

## Phase 7 — Billing & payments

- `server/utils/subscriptions.ts` (state machine, events, enforceBranchLimit,
  select branch, cancel, payment lists).
- Payment driver layer + **Nexadream Payment Hub driver**.
- `checkout.ts` (start, cancel unfinished), `payment-apply.ts`,
  `payment-reconcile.ts`, webhook route.
- `/app/billing` (+ history) with return handling; blocking branch selection.
- Admin: `/admin/payment-gateways`, `/admin/payments`, `/admin/subscriptions`,
  `/admin/webhook-events` (+ replay).
- Cron `/api/cron/subscriptions` with `runThrottled`.
- **End-to-end test against the real hub** with a low-price plan: checkout →
  pay → webhook → active; abandon → expired → no grace while paid-up; cancel
  unfinished; reconcile a payment whose webhook you blocked; replay.
- Register webhook + redirect URLs with the hub admin (`08` §5.6).

## Phase 8 — Back-office completion

- Dashboard, tenants list/detail with suspend/reinstate/plan override/delete,
  tenant users, staff users (invite, edit, deactivate), roles, permissions,
  menus editor (3 levels, reorder), API clients, audit logs, messages, pages
  (rich text), FAQ, scheduled notifications, reports (+ usage analytics).
- Impersonation (three doors) + banners + `useAdminImpersonation`.

## Phase 9 — Public site

- Landing (SSR) from `/api/public/landing`; footer from `/api/public/site`;
  CMS pages; contact form; robots + sitemap; SEO meta + JSON-LD.

## Phase 10 — Public API (if mobile/integrators)

- v1 handlers over the same utils; envelope plugin + error handler;
  mobile-version middleware; API keys (+ `/app/settings/api-keys`,
  `/admin/api-clients`); docs catalog → `/docs/api` + `openapi.json`;
  `settings/public`; usage ping.

## Phase 11 — HRIS domain modules

Follow `18-domain-layer-guide.md` for each module (schema -> catalog ->
abilities -> plan gates -> util -> handlers -> UI -> notifications -> export).
Suggested build order (each is shippable on its own; D6 scope only):

1. **Employee master & org structure** — Employee, Department, Position,
   branch assignment, effective-dated employment history, sensitive-field
   encryption/masking, employee invite -> `TenantUser` link, `employees` limit
   gate, import (CSV).
2. **Attendance** — clock in/out on the branch clock, optional geofence/selfie
   (`attendanceGeofence`), shifts and assignments (`shiftScheduling`),
   corrections via approval.
3. **Leave** — leave types, annual entitlement per UU Ketenagakerjaan, balance
   ledger, requests + approval flow, holiday calendar (`leaveManagement`).
4. **Overtime & reimbursement** — requests, approval flows, attachments,
   feeding payroll inputs (`overtime`, `reimbursement`).
5. **Payroll & payslips** — salary components, effective-dated salary, PPh 21
   TER, BPJS Kesehatan/Ketenagakerjaan, THR, payroll run
   (`draft -> approved -> paid_recorded`, immutable once approved), payslips
   (`payroll`). No bank disbursement.
6. **Documents** — per-employee document vault, contract expiry reminders
   (`documentVault`, `storageMb` limit).
7. **Performance** — basic review cycles and ratings (`performanceReview`).

Record each module's tasks in `../tasks/` and keep the out-of-scope list (D6)
in the project `CLAUDE.md`.

## Phase 12 — Production readiness

- `JWT_SECRET`, `SETTINGS_SECRET` set; pooled DB URL; separate DB per env.
- Superadmin password changed; SMTP configured and tested; gateway active.
- Cron declared in `vercel.json` and verified firing; storage CORS if needed.
- Vercel project: env vars set, `vercel.json` crons registered, Neon pooled
  URL; rate limiter / caches are per instance and best-effort only (see `01`
  §7) — anything that must be exact is backed by the database.
- UU PDP checklist: sensitive fields encrypted + masked, reads audit-logged,
  consent captured, retention purge job scheduled.
- Mark the changelog version Released at deploy.

---

## Definition of done (every change)

- [ ] `npm run lint` passes with zero errors.
- [ ] Typecheck passes for the files changed.
- [ ] `CHANGELOG.md` entry; `package.json` version matches.
- [ ] New pages correct in light **and** dark mode, at phone / tablet / desktop.
- [ ] Language check: no English visible to users (except the closed list); no
      product language in identifiers, enum values, field names, codes, docs.
- [ ] No cross-tenant path: every tenant query filters by `tenantId`.
- [ ] No provider vocabulary outside its adapter file.
- [ ] Only `transitionSubscription()` (or the audited override) writes
      `Subscription.status`; every subscription write appends an event.
- [ ] Plan rules read via entitlements, never via a plan slug.
- [ ] New reference data shipped in a migration **and** the seed.
- [ ] New `/api/v1` endpoints are in the docs catalog.

## Pitfalls that already cost real time

| Pitfall | Correct approach |
|---|---|
| Replacing `globalThis.$fetch` in a plugin to add auth | `apiFetch` with lazy client |
| Fulfilling a hub payment from callback content | `trustsWebhookPayload=false` → `getStatus` |
| Matching callbacks by stripping the hub prefix | store and match `gatewayOrderId` exactly |
| Marking payment `paid` and activating the plan in separate writes | one transaction |
| Sending emails inside a DB transaction | after commit, outside |
| Treating an abandoned early renewal as a default | `isSubscriptionDue()` before grace |
| Second checkout for the same plan creating a second charge | reuse the pending one; ask before replacing others |
| Reading the `?status=success` redirect as proof of payment | re-read the payment's status from the API |
| Branch deactivation and the "choose" flag written separately | one transaction |
| Single `AT TIME ZONE` on a UTC `timestamp` column | `(col AT TIME ZONE 'UTC') AT TIME ZONE tz` |
| `startCase(status)` / raw slug in a badge | label map + one badge component |
| `USelectMenu` item with `value: ''` | sentinel constants |
| Hiding paid nav entries on lower plans | show with a lock; 402 opens upgrade dialog |
| Shipping new menus/permissions via `db:seed` in prod | idempotent migration insert |
| Prisma 5/6 `url` in `schema.prisma` | Prisma 7 config + adapter |
| Cron that needs an auth header on a basic scheduler | open URL + throttle + idempotent steps |
| `setInterval` / in-process queue / local file write on Vercel | Vercel Cron, DB-backed state, storage adapter, `waitUntil` |
| Salary/NIK shown in lists or logged in clear | mask + ability + audit-logged reads (D7) |
| Editing an approved payroll run | void + re-run; approved runs are immutable |
| An unknown `{{token}}` in a template | renders empty — never send a template whose key variable is empty |
| Root-relative links in emails | absolutized by the brand wrapper at send time |
