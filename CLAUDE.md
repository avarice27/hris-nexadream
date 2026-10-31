# HRIS Nexadream — Workspace Guide

SaaS HRIS (Human Resource Information System) for companies in Indonesia:
employee data, attendance, leave, overtime, reimbursement, payroll (PPh 21,
BPJS) and employee self-service. Customers are companies (SMEs first);
employees and managers use the same product through role-based views.
Product name **HRIS Nexadream**, key `hrisnexadream`. Identity placeholders
(domain, support email, order prefix) are proposed in `tasks/DECISIONS.md` D1.

## ⚠️ IMPORTANT — Language rule for code

**All code implementation MUST be in English.** This covers variable names,
function names, class names, types/interfaces, file names, enum values,
database tables/columns, API fields, error codes, route/endpoint names, and
commit messages.

- **The only thing allowed in Bahasa Indonesia inside code is comments.**
- User-facing text (UI labels, validation messages, emails, notifications) is
  Bahasa Indonesia, delivered through label maps/catalogs — never by naming an
  identifier or enum value in Indonesian.

```ts
// ✅ Benar: identifier English, komentar boleh Bahasa Indonesia
const activeEmployees = employees.filter(e => e.status === 'active')

// ❌ Salah: identifier Bahasa Indonesia
const karyawanAktif = karyawan.filter(k => k.status === 'aktif')
```

## ⚠️ IMPORTANT — Deployment target: Vercel serverless

The web app (`web/hris-nexadream/`) will be built and deployed on **Vercel serverless**.
Every implementation must work under that model:

- **No long-running processes, timers or in-process queues.** Each request runs in a
  short-lived function instance; anything after the response may be killed. Background
  work must be awaited or handed to the platform's `waitUntil`.
- **In-memory state is per instance and best-effort only** (caches, rate limits,
  throttles). Never rely on it for correctness; durable state goes in the database.
- **No writes to the local filesystem** in production (read-only except `/tmp`).
  Uploads go through the storage adapter (Vercel Blob by default; Supabase / S3 drivers kept). Employee documents are
  **private** objects served through short-lived signed URLs.
- **Scheduled jobs = Vercel Cron** declared in `web/hris-nexadream/vercel.json`, hitting
  plain public `GET /api/cron/*` endpoints (no auth, throttled, idempotent).
- Keep functions fast and stateless; use the pooled DB connection (Neon pooler).
  Heavy work (e.g. a payroll run for hundreds of employees) is chunked into
  resumable, idempotent steps — never one long request.

## Folder map

| Path | What |
|---|---|
| `BUSINESS_DESC.md` | Product & business reference (personas, modules, subscriptions, relationships). Source of truth for the domain. |
| `saas-blueprint/` | Implementation-level spec of the multi-tenant SaaS platform layer (adapted to HRIS). Read `README.md` + `01-architecture.md` first. |
| `design/` | Visual style reference: `design/design.md` (tokens, components, layout, HR-specific UI patterns). To be mapped into `web/hris-nexadream/app/assets/css/main.css`. |
| `web/hris-nexadream/` | The Nuxt 4 web app (landing + company console + employee self-service + admin back-office + API). Has its own `CLAUDE.md`. |
| `tasks/` | **Build plan & progress tracker.** `tasks/tasks.md` = phases and checklists, `tasks/DECISIONS.md` = decision log. Start every session here. |

Mobile app is **out of scope for now** — web is the foundation (attendance via
responsive web/PWA). Keep business logic in `server/utils/*` so a future
`/api/v1` (mobile) reuses it.

## How to work across sessions

1. Read `tasks/tasks.md` → find the current phase and the first unchecked task.
2. Read `tasks/DECISIONS.md` before touching schema, auth, plans, payroll or billing.
3. Read the blueprint files referenced by the task before coding it.
4. When a task is done, tick it (`- [x]`) in `tasks/tasks.md` and update the
   phase status table there. Add new tasks you discover instead of keeping
   them in your head.
5. Open, expensive-to-reverse decisions (schema shape, enum values, public API
   fields, pricing, payroll rules) → ask the user first, then record the answer
   in `tasks/DECISIONS.md`. Items marked **Proposed** there are defaults the
   owner has not confirmed yet.

## Key domain decisions (summary — details in `tasks/DECISIONS.md`)

- **Tenant = Company**; **Branch = office/work location** (count is a plan
  entitlement, each branch has its own timezone: WIB/WITA/WIT).
- **Subscription is attached to the Tenant (company)** and paid by the owner.
  Employees never pay.
- One global login per person. Tenant roles: `owner`, `hr_admin`, `manager`,
  `employee`. Owner/HR admin/manager logins consume team seats; employee
  logins do not — the plan limit for employees counts active **Employee
  records** (an employee may exist without a login).
- The platform **never moves salary money**. Payroll is calculated and
  recorded (payslips); the bank transfer happens outside. The Nexadream Payment
  Hub is only for company → platform subscription payments.
- NIK, NPWP, BPJS numbers, bank account, salary and family data are personal
  data (UU PDP): encrypted at rest, masked by default, readable only with an
  explicit ability, and audit-logged on read.
- Approved payroll runs and attendance history are immutable; corrections are
  void + re-run / adjustment records, never edits.
- Out of scope for now: recruitment/ATS, LMS, e-signature, bank disbursement,
  tax filing, biometric hardware, native mobile app. Do not half-build them.
