# HRIS Nexadream — Build Plan & Progress

Start every session here. Tick `- [x]` when done; add discovered tasks in the
right phase. Decisions live in `DECISIONS.md`. The platform-layer phases (0–10,
12) mirror `saas-blueprint/17-implementation-plan.md`; Phase 11 is the HRIS
domain layer (`saas-blueprint/18-domain-layer-guide.md`).

## Phase status

| # | Phase | Status |
|---|---|---|
| 0 | Decisions & docs adaptation | in progress (owner inputs D6 scope + brand assets) |
| 1 | Skeleton | done |
| 2 | Schema & seed | done (verified on in-memory Postgres; not yet on a real DB) |
| 3 | Auth & RBAC | done (Google OAuth deferred) |
| 4 | Settings, email, notifications | done (push/FCM deferred; SMTP not yet configured) |
| 5 | Tenancy (company, branches, team) | done |
| 6 | Plans & entitlements | done |
| 7 | Billing & payments | done (real-hub test pending credentials) |
| 8 | Back-office completion | done (push/FCM & usage analytics deferred) |
| 9 | Public site | done (legal copy needs lawyer review) |
| 10 | Public API (`/api/v1`) | done |
| 11 | HRIS domain modules | done (statutory rates need tax-consultant verification) |
| 12 | Production readiness | code done — remaining items need owner credentials/ops |

## Phase 0 — Decisions & docs

- [x] Rewrite `CLAUDE.md` for HRIS Nexadream
- [x] Adapt `saas-blueprint/*.md` (identity, roles, plans, HR vocabulary)
- [x] Write `BUSINESS_DESC.md`, `design/design.md`, `tasks/DECISIONS.md`
- [x] Owner confirms D1 identity: domain, support email, hub order prefix (hub prefix `HRN` still to confirm with the hub admin)
- [x] Owner confirms D3 roles and D4 plan limits/prices (prices still placeholders; per-employee pricing open)
- [ ] Owner confirms D6 scope for MVP (which modules ship first)
- [ ] Owner provides brand assets (logo, colours) → update `design/design.md`

## Phase 1 — Skeleton (`web/hris-nexadream/`)

- [x] Nuxt 4 + Nuxt UI v4 + ESLint; `routeRules` for `/app/**`, `/admin/**`; Nitro preset `vercel`
- [x] Prisma 7 + `prisma.config.ts` + pg adapter client (Neon pooled)
- [x] `.env.example`, `vercel.json` (cron placeholder), project `CLAUDE.md`
- [x] Shared catalogs (`status`, `plans`, `permissions`, `tenant-abilities`, `menus`, `settings`, `templates`, `payments`, `phone`, `auth-rules`)
- [x] Map `design/design.md` tokens into `main.css` (light + dark)
- [x] Layouts: `public`, `tenant`, `auth-tenant`, `admin`, `auth-admin`
- [x] `CHANGELOG.md` `## 0.1.0 (Draft)`
- [x] Unit tests (`npm test`): RBAC role × ability matrix, crypto, catalogs

## Phase 2 — Schema & seed

- [x] Platform schema from `02-database-schema.md`; first migration (`20261015000000_init`; + `Tenant.legalName/industry/npwp`, `TenantInvitation.employeeId`)
- [x] Idempotent seed: permissions, roles, menus, settings, templates, plans (free/growth/business/enterprise), gateway row, pages, FAQ, superadmin, demo company
- [ ] Apply migration + seed on the real dev DB (local Postgres or Neon) — needs `DATABASE_URL` from the owner

## Phase 3 — Auth & RBAC

- [x] Auth facade, JWT driver, gatekeepers (`requirePlatformContext`, `requirePermission`, `requireSuperAdmin`, `requireTenantContext`, `requireTenantAbility`, `requireNotImpersonating`, `requireBranchAccess`, `branchScopeWhere`)
- [x] Admin auth (login, logout, profile, menus, forgot/reset, accept-invite); company owner register/login (email or phone); change password (both audiences)
- [x] Role presets `owner / hr_admin / manager / employee` + abilities; employee confined to `/app/me`
- [x] Audit log for sign-in (+failed), sign-out, register, password reset/change
- [x] Client: `apiFetch`, `useAuthClient` + `useTenantAuth` / `usePlatformAuth`, global route guard, management / ESS / admin shells
- [x] Own-record & manager scope gatekeepers (`requireOwnEmployee`, `requireEmployeeAccess`, `visibleEmployeesWhere`/`employeeScopeWhere`) — Phase 11
- [x] Sensitive-read auditing helper `auditSensitiveRead` (`employee.sensitive_read`, `salary.read`; blocks impersonation)
- [ ] Google OAuth + handoff provider (`03` §5) — optional, needs `GOOGLE_CLIENT_ID/SECRET`
- [x] Impersonation endpoints + banners (`03` §10) — Phase 8
- [x] Shared-store rate limit (`rate_limit_buckets`, hashed keys) for login, password reset, register, contact, invites

## Phase 4 — Settings, email, notifications

- [x] Settings util (`getSetting*`, `setSettings`, `claimSettingValue`) + `/admin/settings` (tabs from catalog, masked secrets) + test email
- [x] Email: brand wrapper (`shared/utils/email-brand.ts`), plain-text alternative, template resolution (DB active → DB, inactive → not sent, missing → catalog)
- [x] Template catalog: generic platform + HRIS keys (employee invitation, leave, payslip, attendance, contract, overtime/reimbursement, employee limit), `{{#block}}` support, D7 content rule
- [x] `/admin/email-templates` (editor + variable palette + live preview, unknown-token guard) and `/admin/notification-templates`
- [x] In-app notifications: `createNotification` (+ tx mode), `notifyPlatform`, list/read/read-all for both audiences, bell in all shells (60 s polling while visible), `/app/notifications`, `/admin/notifications`
- [x] Registration sends welcome + trial bell rows and the staff "new company" bell; post-commit side effects can no longer fail a registration
- [x] Migration `20261016000000_phase4_templates` ships the catalog templates (`scripts/template-migration-sql.ts` regenerates the SQL)
- [ ] Configure real SMTP in `/admin/settings` and send a test email (needs SMTP credentials from the owner)
- [ ] Push (FCM) channel + `PushDevice` endpoints + web push opt-in (`11` §5) — optional, needs `FIREBASE_SERVICE_ACCOUNT`
- [x] Scheduled broadcasts `/admin/scheduled-notifications` (bell; audience owner+HR / team / all) dispatched by both crons
- [x] Cron reminders are idempotent: auto-close notifies once per record; expiry digest uses a durable daily claim

## Phase 5 — Tenancy

- [x] Company onboarding wizard (profile, NPWP encrypted, first office + timezone, working days/hours, annual leave, UU PDP consent); blocks the console for the owner until done
- [x] Company settings: `/app/settings` (profile, logo, masked NPWP), `/app/settings/work` (work calendar + leave policy), `/app/settings/account`
- [x] Team: invite Admin HR / Atasan with role preset cards, seat limit (`teamMembers`), resend/revoke, change role, branch scope (plan-gated), deactivate/reactivate; `/app/auth/accept-invite` (password only when needed, never overwrites credentials); owner gets a bell when someone joins
- [x] Branches (offices): CRUD, limit check on create/reactivate, primary office, geofence (plan-gated, removing never blocked), delete only when unreferenced; `useActiveBranch` + `<BranchSwitcher>`
- [x] Storage adapter: Supabase (REST), S3-compatible (`aws4fetch`), dev-only local driver; `StoredFile` rows; magic-byte sniffing, size limits, JPEG EXIF/GPS stripping, `storageMb` quota; company logo + avatar uploads, old files retired
- [x] `/app/profile` (name, phone, photo)
- [x] Account export (owner-only JSON, audited, no password/token hashes) + deletion request (staff bell, SLA) + public `/hapus-akun` + `GET /api/public/site`
- [x] Migration `20261017000000_phase5_tenancy`
- [x] ESS invite from an Employee record (`inviteEmployeeToEss`; accept links `Employee.tenantUserId`; existing team logins linked directly)
- [x] Branch delete also checks employees, attendance and employment history
- [ ] Large-company export as a background job (cron + storage + signed link) — when exports get big
- [ ] Configure a real storage provider (Supabase or S3/R2) with a public and a PRIVATE bucket — needs credentials

## Phase 6 — Plans & entitlements

- [x] Entitlements module, `requireEntitlement`, `assertWithinLimit` (branches, teamMembers, storageMb wired; employees in Phase 11), `GET /api/app/entitlements` with usage
- [x] `useEntitlements` (can/limit/used/remaining/atLimit, `handlePlanError`, auto-refresh after relevant writes); every tenant 402 opens the dialog via `useApiToast`
- [x] `<UpgradeDialog>` (mounted once; suggests only plans that solve the specific feature/limit; owner-only CTA; "data is never deleted" promise), `<TrialBanner>` (trial days left / grace deadline, owner only), `<UpgradeRailButton>` (hidden when the plan has every feature or role can't buy)
- [x] Locked nav entries (shown with a lock, never hidden) + `<FeatureLocked>` state on direct visits; "at limit" buttons open the dialog instead of being disabled
- [x] `GET /api/app/plans`; `/admin/plans` editor (fields generated from LIMIT_KEYS/FEATURE_KEYS, unlimited toggle, default/trial plan protected, delete only when unused, audited diffs, invalidates all tenants)
- [x] zod default messages in Bahasa Indonesia on server and client (`z.locales.id()`); found an English leak in testing
- [x] Session-scoped client state (plan, offices, settings, notifications) cleared on sign-in/out so it never carries across accounts
- [x] Downgrade enforcement — done in Phase 7 (offices/team); employees: see D21

## Phase 7 — Billing & payments

- [x] Subscription state machine (`transitionSubscription`, single writer, `SubscriptionEvent` on every write) + pure rules in `shared/utils/billing-rules.ts` (unit-tested)
- [x] Payment driver layer + Nexadream Payment Hub driver (checked against the live docs at nexadream.id/docs/payment-hub)
- [x] Checkout (idempotent per plan+period, server-side price, owner only, blocked while impersonating), cancel unfinished charge, payment status read
- [x] `applyPayment` (paid + plan activation in ONE transaction; failed/expired enter grace only when actually due), webhook receiver (stored + deduped before applying; unverifiable hub callbacks re-read from the hub), reconciliation
- [x] Downgrade enforcement: excess offices + team logins deactivated (owner/primary kept, nothing deleted), blocking "choose active offices" dialog, `select-branch`
- [x] `/app/billing` (plans, monthly/yearly, pending charges, cancel/resume), `/app/billing/history`, `/app/billing/return` (reads status from the API, never the URL)
- [x] Admin: `/admin/payment-gateways` (masked secrets, catalog-driven fields, one active), `/admin/payments`, `/admin/subscriptions`, `/admin/webhook-events` (+ replay)
- [x] Cron `/api/cron/subscriptions` (trial/grace/cancel expiry, renewal due → grace, daily trial reminders via durable claim, reconcile) + `vercel.json` (01:00 UTC = 08:00 WIB)
- [x] Dev-only mock Payment Hub (`/_dev-hub`, 404 in production) for local end-to-end testing
- [x] End-to-end against the mock hub: checkout → pay → callback → active; reuse; cancel unfinished; forged callback ignored; foreign-platform callback stored only; failed charge while paid-up = no grace; renewal due → grace → Free with enforcement; office selection
- [ ] **End-to-end against the REAL hub** — needs the platform API key + confirmed `HRN` prefix from the hub admin; register webhook `…/api/webhooks/payments/nexadream_hub` and finish/error/pending redirect `…/app/billing/return`
- [x] Employee limit: creating/importing/reactivating refused at the cap (402) + owner bell; no auto-deactivation of HR records (D21)
- [x] Plan override form on the tenant detail page — Phase 8
- [ ] Invoices/receipts (PPN, legal entity) — needs D11 answers

## Phase 8 — Back-office completion

- [x] Dashboard (counts only, batched queries) and reports (revenue/new paid/renewals/churn/trials/signups/onboarding per day|week|month, current book & MRR, conversion, `historySince`; chart + data table)
- [x] Companies: list with filters, detail (profile, subscription + history, usage meters, features, offices, team logins, payments, deletion request; no employee data, NPWP never shown), suspend/reinstate, plan override (`admin_override` event + enforcement), soft delete (superadmin)
- [x] Impersonation, three doors (company owner, a specific company login, another staff member): mandatory reason, 30-minute token, no chaining, audited start/stop, billing + deletion + data export blocked, `assertSensitiveReadAllowed()` for Phase 11 sensitive reads, session dies if the staff member is deactivated or loses `impersonation.use`; banners in both consoles
- [x] Permissions `impersonation.use` (superadmin) and `impersonation.viewSensitive` (nobody) + migration `20261018000000_phase8_permissions`
- [x] Staff users (invite, edit, deactivate, revoke invite, self-protection rules), roles (permission checklist, system/superadmin protections), permission catalog, menu editor (3 levels, up/down reorder, children guard), tenant users (employee contacts masked), audit logs (range presets, filters), staff profile
- [x] CMS: pages with TipTap editor (lazy) + server-side `sanitize-html`, FAQ, contact inbox (status flow), public `POST /api/contact` (rate limit + honeypot + staff bell), public `/page/:slug`, `GET /api/public/faq`
- [x] Found & fixed in testing: dashboard exhausted the DB pool (11 parallel queries), tenant-detail layout at narrow widths, "Selesai" closing a non-popup tab, cleared session state crashing live components
- [x] `/admin/reference-data` (payroll rates JSON — TER A/B/C, Pasal 17, PTKP, BPJS — and national holidays per year), effective-dated
- [x] `/admin/scheduled-notifications` (bell broadcasts); push device list / test push wait for FCM credentials
- [x] `/admin/api-clients` (list + revoke) — Phase 10
- [x] Hard-purge job (two stages: operational data after `privacy.retentionMonths`; payroll/tax records after `privacy.financialRetentionYears`) + former-employee anonymisation, in `/api/cron/hr`
- [ ] Usage analytics section in reports (`usage_daily`) — Phase 10 usage ping

## Phase 9 — Public site

- [x] `GET /api/public/landing` (active+public plans, FAQ, company incl. socials, `registrationOpen`, trial plan/days, site URL) in `server/utils/public-site.ts`
- [x] Landing `/` (SSR): hero + mockup, features (each tied to a plan feature → "Mulai paket X" computed from the DB), why us, 3 steps, pricing from plans (monthly/yearly toggle with saving, employees limit first, "Semua di X, plus:" feature diff, Enterprise = "Hubungi kami" → `#kontak`), FAQ accordion, contact section + form (honeypot), final CTA; hides "Coba gratis" when registration is closed
- [x] `v-reveal` universal directive (only hides after `html.js-reveal` is set, only under `prefers-reduced-motion: no-preference`; elements already in view are never hidden)
- [x] Public layout: section nav (+ mobile menu), footer from `/api/public/site` (tagline, socials and Play badge only when set, legal links)
- [x] `/privacy`, `/terms` (canonical; `/page/privacy|terms` → 301), `<CmsPageView>`; page tokens `{{COMPANY_NAME}}`, `{{SUPPORT_EMAIL}}`, `{{PRIVACY_CONTACT}}`, `{{DELETE_SLA_DAYS}}`, `{{FINANCIAL_RETENTION_YEARS}}`, `{{BACKUP_RETENTION_DAYS}}` filled from settings
- [x] Migration `20261019000000_phase9_public_site`: privacy (UU PDP draft), terms, payment policy, getting-started guide, 12 starter FAQ (idempotent; seed no longer creates content)
- [x] `robots.txt`, `sitemap.xml` (landing, `/hapus-akun`, published pages with `lastmod`), SEO meta + canonical + OG, JSON-LD (`Organization`, `SoftwareApplication` with IDR offers, `FAQPage`), favicon + theme colour
- [x] New settings: `company.instagramUrl/linkedinUrl/facebookUrl/youtubeUrl/playStoreUrl`
- [ ] Lawyer review of privacy / terms / payment policy before launch (pages are marked "Draf")
- [ ] OG share image (`og:image`) and apple-touch PNG icon — need brand assets
- [x] `/docs/api` page + sitemap entry — Phase 10
- [ ] Optional `#artikel` blog proxy (`GET /api/public/articles`) — only if a blog exists
- [x] Bundle icon collections (`@iconify-json/lucide`, `@iconify-json/simple-icons`)
- [x] Landing copy matches shipped modules (Phase 11 delivered attendance, leave, payroll, ESS, documents, multi-office)

## Phase 10 — Public API

- [x] `defineApiV1Handler`: envelope `{ data }` / `{ data, meta }` / `{ error }`, JSON-only writes (415), mobile version gate (426), generic 5xx messages
- [x] API keys `hn_live_/hn_test_` (sha256 only, plaintext once), scopes read/write/sensitive enforced at one door; keys act as owner, never billing/account/team; kill switch `app.apiKeysEnabled`
- [x] Endpoints over the same utils as `/api/app` (settings/public + plans with ETag, auth, me, org lists, employees CRUD, attendance board, self clock-in/out, leave list/decide/self, payroll runs, self payslips, api-keys)
- [x] Single catalog `shared/utils/api-docs.ts` → `/docs/api` (public, integrator endpoints), `/internal/api` (setting-gated), `/api/v1/openapi.json`
- [x] Owner page `/app/settings/api-keys`; `API_CHANGELOG.md`
- [ ] More v1 endpoints as mobile/integrators need them (overtime, reimbursement, documents, performance, reports) — each needs a catalog entry

## Phase 11 — HRIS domain modules

Build in this order; each follows `18-domain-layer-guide.md` (schema →
catalog → abilities → plan gates → util → handlers → UI → notifications →
export).

- [x] 11.1 Organization: departments (tree), positions, holidays calendar (+ import national holidays from reference data), HR settings
- [x] 11.2 Employee master: profile, effective-dated employment history (+ cron applies future changes), sensitive fields encrypted/masked/reveal-with-audit, family, effective-dated salary, termination/reactivation, ESS invite/link/revoke, CSV import (preview → commit) & export
- [x] 11.3 Attendance: clock in/out (branch-local day, overnight shifts), geofence/selfie (gated), daily board, admin entry as audited correction, correction requests with approval, calendar, auto-close cron
- [x] 11.4 Shifts & schedules: default shift from onboarding calendar, extra shifts + weekly roster gated `shiftScheduling`
- [x] 11.5 Leave: types (from onboarding policy / UU defaults), ledger balances with idempotent annual grant (lazy + cron), working-day counting, requests, approval, cancellation reversal, team calendar, balance adjustment
- [x] 11.6 Overtime (PP 35/2021 limits, day type from schedule) & reimbursement (approved amount, receipts) + shared approval engine + approval inbox
- [x] 11.7 Payroll: components, PPh 21 TER A/B/C + final-period Pasal 17, BPJS (caps, enrolment flags, JKK rate), overtime pay, THR proration, unpaid leave, proration for joiners/leavers, chunked resumable runs, approve → paid_recorded → void, encrypted payslips, printable payslip, summary & bank-transfer CSV
- [x] 11.8 Documents vault (private, signed URLs ≤ 5 min, audited), employee self-upload, contract/probation/document expiry digest cron
- [x] 11.9 Performance (basic): cycles, weighted goals, self review, manager/HR finalisation
- [x] 11.10 Reports + exports: headcount/turnover, attendance, leave, payroll (retention clamp), CSV with BOM + formula-injection guard
- [x] 11.11 Employee self-service (home, attendance, leave, requests, payslips, documents, performance, profile) + approvals inbox + dashboard

## Phase 12 — Production readiness

- [x] Readiness checks (`/admin/system` + startup log): secrets length/distinctness, pooled DB URL, storage, SMTP, gateway, site URL, superadmin; public `/api/health`
- [x] Vercel Cron schedules in `vercel.json` (`/api/cron/subscriptions` 01:00 UTC, `/api/cron/hr` 17:30 UTC)
- [x] Security review of sensitive-data paths → `tasks/SECURITY_REVIEW.md` (one gap fixed: leave attachments now audited)
- [x] DB pool capped per instance (`DB_POOL_MAX`, default 5)
- [ ] OWNER/OPS: set `JWT_SECRET`, `SETTINGS_SECRET`, `HR_DATA_KEY` (≥ 32 chars, distinct), pooled Neon URL, separate DB per env
- [ ] OWNER/OPS: superadmin password changed; SMTP tested; Payment Hub production key + `HRN` prefix + webhook registered
- [ ] OWNER/OPS: storage buckets (public + PRIVATE) and CORS; run `prisma migrate deploy` + seed on the real DB
- [ ] OWNER: tax consultant verifies `/admin/reference-data` payroll rates; lawyer reviews privacy/terms/payment policy; fill 2026 religious holidays
- [ ] Mark changelog Released at deploy

## Out of scope (do not half-build)

Recruitment/ATS, LMS, e-signature, bank disbursement, tax filing (e-Bupot),
biometric hardware, native mobile app.
