# HRIS Nexadream — Decisions Log

Single source for decisions that are expensive to reverse. `CLAUDE.md` and
`saas-blueprint/` follow this file. Status: **Proposed** = chosen by the AI as a
sensible default while adapting the blueprint, waiting for the owner's
confirmation; **Confirmed** = the owner said yes. Change a decision here first,
then propagate it.

## D1 — Product identity (Confirmed)

| Placeholder | Value |
|---|---|
| `{{APP_NAME}}` | HRIS Nexadream |
| `{{APP_KEY}}` | `hrisnexadream` |
| `{{SITE_URL}}` | `https://hris.nexadream.id` |
| `{{SUPPORT_EMAIL}}` | `support@nexadream.id` |
| `{{ORDER_PREFIX}}` | `HRN` (issued by the Payment Hub — must be confirmed with the hub admin) |
| `{{LOCAL_ORDER_PREFIX}}` | `HR` |
| `{{API_KEY_PREFIX}}` | `hn` → `hn_live_…` |
| `{{CLIENT_HEADER}}` | `x-hrisnexadream-client: HRISNexadream/1.0.0` |

## D2 — Customer model (Confirmed)

- **Tenant = Company** (the customer business that buys the subscription).
  Code identifiers stay `Tenant` / `tenantId` (generic platform layer); UI says
  "Perusahaan".
- **Branch = office / work location** (kept). Branch count is a plan
  entitlement. Each branch has its own timezone (WIB / WITA / WIT).
- **Subscription is attached to the Tenant (company)**, paid by the company
  owner. Employees never pay.
- One person = one global login (`TenantUser`); a login belongs to one company
  for now (schema already allows more).
- An **Employee** record (HR data) is a domain row; it may exist **without** a
  login. Inviting an employee to self-service creates/links a `TenantUser` +
  `TenantMembership` with role `employee`.

## D3 — Tenant roles (Confirmed)

`TenantRole` enum (English slugs): `owner`, `hr_admin`, `manager`, `employee`.

| Role | UI label | Preset |
|---|---|---|
| `owner` | Pemilik | Everything, incl. billing, team and company deletion. |
| `hr_admin` | Admin HR | Full HR operations (employees, attendance, leave, payroll); no billing/ownership. |
| `manager` | Atasan / Manajer | Approves leave/overtime/reimbursement and sees attendance of direct/indirect reports; no payroll, no salary data. |
| `employee` | Karyawan | Self-service only: own profile, attendance, leave, payslips, requests. |

Seat rules: `teamMembers` limit counts **owner + hr_admin + manager** logins
(+ pending invitations). `employee` logins do **not** consume team seats; the
`employees` limit counts active Employee records instead.

## D4 — Plans (Confirmed — pricing is a placeholder)

Plan slugs: `free`, `growth`, `business`, `enterprise` (all editable in
`/admin/plans`; code reads limits/features by key only).

| | free | growth | business | enterprise |
|---|---|---|---|---|
| `employees` | 10 | 50 | 250 | -1 |
| `branches` | 1 | 3 | 10 | -1 |
| `teamMembers` | 1 | 3 | 10 | -1 |
| `reportRetentionDays` | 90 | 365 | 1095 | -1 |
| `storageMb` | 100 | 1024 | 10240 | -1 |
| price / month (IDR) | 0 | 199 000 | 599 000 | custom |
| trial days | 0 | 14 | 14 | 14 |

Features (`FEATURE_KEYS`): `leaveManagement`, `shiftScheduling`,
`attendanceGeofence`, `overtime`, `reimbursement`, `payroll`,
`performanceReview`, `documentVault`, `export`, `import`, `multiBranchRollup`,
`branchScopedRoles`, `customApprovalFlows`, `activityLog`, `apiAccess`,
`prioritySupport`. Concrete values per tier live in the seed
(`02-database-schema.md` §4).

Open: per-employee pricing (e.g. IDR X / employee / month above a base) instead
of flat tiers — ask the owner before building billing.

## D5 — Money flows (Confirmed by blueprint, adapted)

The platform **never moves salary money**. Payroll is calculated and recorded
(payslips, status `draft → approved → paid_recorded`); the actual bank transfer
happens outside the platform. The Nexadream Payment Hub is used **only** for
company → platform subscription payments.

## D6 — Indonesian HR scope (Proposed)

In scope for the domain layer: Employee master, org structure (department,
position, branch), attendance (clock in/out, optional geofence/selfie),
shifts, leave (annual per UU Ketenagakerjaan + custom types), overtime,
reimbursement, payroll (PPh 21 TER method, BPJS Kesehatan / Ketenagakerjaan,
THR, allowances/deductions), payslips, documents, basic performance review.
Out of scope for now (written list, do not half-build): recruitment/ATS,
learning management, e-signature, bank disbursement, tax filing (e-Bupot),
biometric hardware integration, native mobile app.

## D7 — Sensitive data (Proposed)

NIK, NPWP, BPJS numbers, bank account number, salary and family data are
personal data under **UU PDP**: encrypted at rest (AES-256-GCM helper from
`16-cross-cutting.md`), masked in lists, readable only with an explicit
ability, and every read of salary/identity fields is audit-logged.

## D8 — Language (Confirmed, from original CLAUDE.md)

All code in English; user-facing text in Bahasa Indonesia via label maps. Only
code comments may be Bahasa Indonesia.

## D9 — Platform / hosting (Confirmed, from original CLAUDE.md)

Nuxt 4 on Vercel serverless, Neon Postgres (pooled), Prisma 7, Vercel Cron.
Mobile app out of scope; web first, `/api/v1` later reuses `server/utils/*`.

## D10 — Trial plan (Proposed)

Signup trial uses the `business` plan (setting `billing.trialPlanSlug`), 14
days, one trial per email; afterwards the tenant falls back to `free` unless
it pays.

## D11 — Open questions raised while adapting the blueprint

- Statutory retention period for payroll/tax records (`privacy.statutoryRetentionYears`) — needs legal review.
- Do owner/hr_admin accounts count against the `employees` limit and team seats when they are also employees? (Currently: owner is not auto-created as an Employee.)
- Impersonation by platform staff cannot read sensitive HR data (`impersonation.viewSensitive` exists but stays unassigned unless you decide otherwise).
- API-key `sensitive` scope vs masked-only.
- Who maintains statutory rates (PPh 21 TER, BPJS, UMK) and is editing limited to superadmin?
- PPN 11% on subscription invoices and the legal entity name for invoices.
- Vercel Cron: the proposed 7 jobs (some sub-daily) likely need a Pro plan — verify current limits.
- Dedicated `HR_DATA_KEY` for encrypting HR fields (separate from `SETTINGS_SECRET`).

## D12 — Canonical permission & ability keys (Proposed, implemented in Phase 3)

- Tenant abilities: the list in `web/hris-nexadream/shared/utils/tenant-abilities.ts`
  is canonical (`<domain>.<read|write|approve|self>` plus `employees.sensitive.read`,
  `payslips.read.own`, `self.profile`). Blueprint examples that differ
  (`employees.read_sensitive`, `employees.manage`, `payroll.manage`,
  `approvals.act`, …) map to these. `hr_admin` has no `billing.manage`,
  `account.manage` or `team.manage`; ESS invites are gated by `employees.write`.
- Platform permissions: `web/hris-nexadream/shared/utils/permissions.ts`, incl.
  the new `reference-data.read/write` group for statutory tables. Impersonation
  stays superadmin-only (no separate permission key yet).

## D13 — Prisma 7 client location (Implemented)

Generator `prisma-client` with output `web/hris-nexadream/generated/prisma`
(gitignored, regenerated on `npm install`). Import from
`~~/generated/prisma/client`, not `@prisma/client`.

## D14 — Email links outside production (Implemented)

Outside `NUXT_PUBLIC_APP_ENV=production`, email links use
`NUXT_PUBLIC_SITE_URL` (the environment's own origin); in production they use
the `company.siteUrl` setting. Prevents dev/staging emails linking to prod.

## D15 — Phase 5 implementation choices (Proposed)

- **Work calendar & leave policy before the HR modules exist** are stored as JSON on
  `Tenant` (`workCalendar`, `leavePolicy`). Phase 11 (attendance/leave) seeds its
  own tables (shifts, `LeaveType`) from them; after that the JSON is only defaults.
- **Uploads are tracked** in a `StoredFile` table (path, size, visibility, purpose,
  provider) so `storageMb` can be enforced and objects deleted on replace/erasure.
- **Storage drivers:** Supabase via REST and S3-compatible via `aws4fetch` (no
  heavy SDKs on Vercel). A local-disk driver exists for development only and is
  used automatically in dev when no provider is configured; it refuses to run in
  production.
- **Company NPWP** is encrypted with the HR key (`HR_DATA_KEY`) and only ever
  returned masked, except in the owner's own data export.
- **Deletion request** is owner-only, blocked during impersonation, and notifies
  staff with `tenants.write`; there is no self-service cancel yet.

## D16 — Billing implementation choices (Proposed)

- **Hub redirect**: the hub appends `?reference=…&result=…&status=…` itself, so the
  finish URL is a clean path, `/app/billing/return` (not `?status=success&order_id=`
  as the blueprint showed). Register the same URL as the finish, error and pending
  redirects with the hub admin. The page never trusts those parameters; it reads
  the payment status from our API, which re-reads the hub.
- **Renewal**: the hub has no recurring billing. When an `active` period ends without
  a new payment, the daily cron moves the company to `past_due` (grace,
  `billing.gracePeriodDays`, default 3) and notifies the owner; after grace → Free
  with enforcement. Paying early stacks onto the remaining time.
- **Downgrade enforcement** deactivates excess offices (primary kept) and excess
  Admin HR/Atasan logins (newest first; owner never), and revokes pending team
  invitations. Nothing is deleted; after upgrading, the owner re-activates what
  they want.
- **Amount check**: a "paid" result whose amount differs from what we charged is
  not applied (logged as `amount_mismatch`) and needs manual review.
- **Dev mock hub** at `/_dev-hub` (404 in production) implements the documented
  hub API so the real driver is exercised locally.

## D17 — Timestamps & raw SQL (Rule)

Timestamp columns hold UTC (`timestamp without time zone`). Never use the
database's `now()` / `CURRENT_TIMESTAMP` in raw SQL: the session timezone may
not be UTC (the local Postgres here runs at UTC+7). Pass JS `Date` values as
parameters, or write `(now() AT TIME ZONE 'utc')`. Prisma already sends dates
itself. A session `SET TIME ZONE` is not used because it is unreliable through
Neon's transaction pooler.

## D18 — Back-office & impersonation (Proposed)

- Impersonation requires `impersonation.use` (only the superadmin role by default),
  a written reason (≥ 10 chars or a ticket id), lasts 30 minutes, cannot be chained,
  and is audited at start and stop. While impersonating: billing, deletion request
  and data export are blocked; any future sensitive read (NIK, salary, payslips,
  documents) is blocked unless the staff role explicitly holds
  `impersonation.viewSensitive`, which no role holds by default (superadmin does
  NOT bypass this one). Deactivating a staff member immediately ends sessions
  they opened.
- Company soft delete = `deletedAt` + all memberships deactivated + final email to
  the owner. Hard purge after retention is a separate job (not built yet).
- CMS HTML is sanitised server-side on save (allow-list), so public pages can never
  carry script; `privacy` and `terms` pages cannot be deleted.
- Platform staff see employee-role logins with masked email/phone.

## D19 — Public site (Proposed)

- Nothing commercial is hard-coded on the landing: prices, limits, features, trial
  length, FAQ, contact details and legal copy come from the DB / settings.
- A plan is shown as **"Hubungi kami"** (custom pricing, CTA to `#kontak`) when its
  monthly and yearly prices are both 0 **and** its employee limit is unlimited
  (`isCustomPricedPlan`); a 0-priced plan with a finite limit is "Gratis". JSON-LD
  offers skip custom-priced plans.
- No tax claim on the landing ("belum termasuk PPN") until checkout actually applies
  `billing.invoiceTaxRatePercent` (it does not yet; see D11).
- Legal/CMS pages may use `{{TOKEN}}`s filled from settings at read time (HTML-escaped),
  so promises in the privacy policy (deletion SLA, retention years, contact) never
  diverge from `/admin/settings` and `/hapus-akun`.
- `/privacy` and `/terms` are the canonical URLs; `/page/privacy|terms` 301 to them.
- Initial CMS pages and FAQ ship in a migration (seed does not run in production);
  all legal pages are marked "Draf" until a lawyer reviews them.

## D20 — HRIS domain design (Proposed, implemented in Phase 11)

- **Effective dating.** Branch, department, position, manager, employment type and status are
  rows in `employment_history`; the copy on `employees` is the latest effective row, changed only
  together with a history row (future-dated changes applied by `/api/cron/hr`). Salary is
  effective-dated in `employee_salaries`.
- **Encryption.** Identity numbers, bank account, family NIK, salary JSON and per-person payslip
  data are AES-256-GCM with `HR_DATA_KEY`. Only run-level payroll totals are plain.
- **One approval engine** (`approval_steps`) for leave, overtime, reimbursement and attendance
  corrections. Default chain = direct manager (with an active console login), else Admin HR;
  chains `manager`, `manager+hr`, `hr` per request type behind `customApprovalFlows`.
  Owner/Admin HR may decide any current step in their branch scope; nobody decides their own request.
- **Leave** balances are an append-only ledger (`leave_ledger`, unique `sourceId+reason`); annual
  entitlement is granted lazily and by cron once `eligibleAfterMonths` is reached (no proration).
  Days are counted server-side from the schedule and holidays.
- **Attendance** days are branch-local; admin edits of an existing record are stored as an
  approved correction with the previous values (`before`). Auto-close after
  `autoCloseAfterHours` (default 6 h after scheduled end).
- **Payroll** (needs tax-consultant verification): monthly PPh 21 by TER (PP 58/2023) on gross incl.
  employer JKK/JKM/BPJS-Kes premiums; December or the leaving month recomputes the year with
  Pasal 17 minus tax already withheld (negative = refund line). BPJS Kes 4%/1% capped at Rp 12 jt;
  JHT 3.7%/2%; JP 2%/1% capped (2025 cap); JKK company-specific; JKM 0.3%. Overtime per PP 35/2021
  (1/173 of base + fixed allowances). THR per Permenaker 6/2016. Unpaid leave deducts base ÷
  scheduled days. Gross-up method is not supported. Rates live in `reference_data` (key `payroll`).
- **Runs**: one active run per period per branch (or all branches), calculated in chunks of 25,
  approve → paid_recorded, void + new run to correct. Approved runs mark the overtime and
  reimbursements they paid.
- Default national holidays seeded for 2026 contain only fixed-date holidays; staff must add the
  religious holidays and cuti bersama.

## D21 — Employee limit on downgrade (Proposed)

Unlike offices and team logins, employee records are **not** deactivated automatically when a
company is over its `employees` limit (deactivating HR records has legal/payroll consequences).
Instead: creating, importing and reactivating employees is refused with `402 LIMIT_REACHED`
and the owner gets an `employee_limit_reached` bell. Existing employees keep working.

## D22 — Public API v1 & API keys (Proposed, implemented in Phase 10)

- Envelope and error codes per `12-api-conventions.md`; one wrapper `defineApiV1Handler`.
- API keys act as the company owner (audit actor "API: <name>"), are refused for billing,
  account and team abilities, and need the explicit `sensitive` scope for
  `employees.sensitive.read` / `payroll.read` (403 `requiredScope: sensitive` rather than null
  fields — simpler, documented). Keys cannot create or revoke keys.
- `app.apiKeysEnabled` is a global kill switch; `app.internalApiDocsEnabled` opens `/internal/api`.

## D23 — Data retention & purge (Proposed, needs legal review)

- Deleted company, stage 1 after `privacy.retentionMonths` (24): operational HR data, files,
  logins, audit logs, notifications and API keys deleted; employees anonymised; payroll runs and
  payslips plus Nexadream's own payment records retained.
- Stage 2 after `privacy.financialRetentionYears` (10): payroll records, employees, org data and
  offices deleted; the tenant row stays as a tombstone ("Perusahaan dihapus").
- Former employees of active companies are anonymised (and their payslips deleted) once
  `financialRetentionYears` have passed since their end date.

## D24 — Official-rule pass, Vercel Blob, Google sign-in, invoices (Proposed, 2026-10-31)

Sources and open verification items: `tasks/COMPLIANCE_REFERENCE.md`.

- **Storage = Vercel Blob** for every file (`STORAGE_PROVIDER=vercel_blob`, default). Two stores
  because access is fixed per store: Public (logos, avatars) and Private (documents, attendance
  selfies, receipts, exports). Credentials per store: `BLOB_PUBLIC_READ_WRITE_TOKEN` /
  `BLOB_PRIVATE_READ_WRITE_TOKEN` (or `BLOB_*_STORE_ID` + OIDC). Private objects are read through
  presigned GET URLs (`issueSignedToken` + `presignUrl`, ≤ 5 min); bytes never pass through our
  functions. Supabase/S3 drivers stay available.
- **Google sign-in** (blueprint 03 §5) is built but inert until `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` are set: the button only appears when configured. Session tokens never
  travel in URLs (single-use 120 s handoff code). Verified email → links to an existing account;
  unknown email → new owner + company (phone collected in onboarding); unverified email never links.
- **Payroll rates**: TER A/B/C, Pasal 17, PTKP, biaya jabatan unchanged; JP wage cap
  Rp11.086.300 from 1 March 2026 (new `reference_data` row, effective-dated). PPh 21 DTP
  (PMK 105/2025) is not modelled.
- **Gross-up**: per-employee `taxMethod` = `gross` (default) | `gross_up`. Gross-up adds a taxable
  "Tunjangan PPh 21" equal to the tax it causes (fixed-point iteration; TER band oscillation
  resolved with the smallest covering allowance). Also applied in the final-period recompute.
- **Holidays**: 2026 (SKB 1497/2025 …, 17 + 8 cuti bersama) and 2027 (SKB 1205/2026 …, 18 + 8)
  in reference data; companies import them. Cuti bersama stays a non-working day; deducting it
  from annual leave is a follow-up.
- **Subscription invoices**: prices are **inclusive of PPN**. When `billing.pkpRegistered`, the
  invoice shows DPP = total ÷ (1 + 12% × 11/12), DPP nilai lain = 11/12 × DPP, PPN = total − DPP
  (PMK 131/2024, effective 11%). One immutable `SubscriptionInvoice` per paid payment, number
  `INV/<year WIB>/<6-digit global sequence>`. It is a commercial invoice + receipt, not a Faktur
  Pajak — staff record the Coretax Faktur Pajak number afterwards. Receipts > Rp5.000.000 flag
  bea meterai Rp10.000 (e-Meterai on request). `billing.invoiceTaxRatePercent` removed.
- **Legal pages** rewritten for UU PDP (controller/processor, Pasal 20 bases, rights Pasal 5–13,
  3×24 h breach notice, Pasal 56 transfer), UU 8/1999 Pasal 18 (no one-sided change/no-refund
  clauses: explicit refund cases, 14-day notice + pro-rata refund on rejected changes), UU 24/2009
  (Bahasa Indonesia prevails), UU KUP retention. Still recommended: lawyer review before launch.
- **Exports**: large exports are `ExportJob`s advanced in 1 000-row resumable steps (client-driven,
  cron continues abandoned jobs), stored encrypted while partial, final CSV private, 24 h TTL,
  excluded from the storage quota; owner/HR only (`reports.read`), payslips also need `payroll.read`.
- **API keys** never read personal data (documents, selfies, salary) without the `sensitive`
  scope — enforced centrally in `auditSensitiveRead`.
