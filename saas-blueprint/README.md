# HRIS Nexadream — Multi-tenant Subscription SaaS Blueprint

This folder is a **complete, implementation-level specification** of the
multi-tenant subscription SaaS platform layer of **HRIS Nexadream**, an
Indonesian human-resources information system (employee master, attendance,
leave, payroll/payslips, ...). The platform layer was extracted from a running
system and generalised; the HRIS-specific decisions live in
`../tasks/DECISIONS.md` (the source of truth — if this folder and that file
disagree, DECISIONS.md wins). The web app lives at `web/hris-nexadream/`.
The business model:

- companies (tenants) sign up, get a free trial, and pay a recurring
  subscription for a plan tier;
- payment goes through the **Nexadream Payment Hub** (a hosted-checkout
  payment hub fronting one upstream merchant account) —
  host <https://nexadream.id>, docs <https://nexadream.id/docs/payment-hub>,
  integration details in `08-payment-gateway.md`;
- there is a public **landing site**, a tenant **web console** (`/app`), a
  platform **back-office** (`/admin`), and a **server API** (internal + a
  versioned public API for a mobile app and integrators);
- platform staff run everything — tenants, plans, payments, content,
  templates, settings — from `/admin` without a redeploy.

The HRIS domain features (what companies actually *do* inside the app:
employees, attendance, leave, payroll ...) are **not** specified here, except
as patterns and placeholders; see `18-domain-layer-guide.md` and the domain
phase of `../tasks/`. Everything underneath —
tenancy, auth, RBAC, plans, billing, payments, notifications, settings, CMS,
API conventions — is.

---

## How an AI agent should use this folder

1. Read `README.md` (this file) and `01-architecture.md` first. They fix the
   vocabulary and the shape of the codebase.
2. Read the remaining files in numeric order before writing code. Later files
   assume earlier ones.
3. Treat every **MUST / NEVER** rule as a hard requirement. They exist because
   breaking them caused real bugs (billing, data leakage, lost payments).
4. Use the placeholder values below (proposed, see `tasks/DECISIONS.md` D1).
5. Build in the order given by `17-implementation-plan.md`.
6. When the new product's domain needs something this blueprint does not
   cover, follow `18-domain-layer-guide.md` — it encodes how new features plug
   into tenancy, RBAC, plans and the API without breaking them.
7. When a decision is open and expensive to reverse (a schema shape, an enum
   value, a public API field), **ask the human before building**. Cheap,
   reversible choices (a label's wording, an icon) you may decide yourself and
   report.

---

## Placeholders

| Placeholder | Meaning | Value (proposed, see `tasks/DECISIONS.md` D1) |
|---|---|---|
| `{{APP_NAME}}` | Product display name | `HRIS Nexadream` |
| `{{APP_KEY}}` | Lowercase identifier used in storage keys, cache globals, headers | `hrisnexadream` |
| `{{SITE_URL}}` | Public origin of the deployed web app | `https://hris.nexadream.id` |
| `{{SUPPORT_EMAIL}}` | Support inbox | `support@nexadream.id` |
| `{{ORDER_PREFIX}}` | Order-id prefix issued by the Payment Hub for this platform | `HRN` (must be confirmed with the hub admin) |
| `{{LOCAL_ORDER_PREFIX}}` | Prefix of our own order ids | `HR` |
| `{{API_KEY_PREFIX}}` | Prefix of tenant API keys | `hn` -> `hn_live_...` |
| `{{CLIENT_HEADER}}` | Header the mobile app sends with its version | `x-hrisnexadream-client: HRISNexadream/1.0.0` |

HRIS vocabulary (D2/D3): **Tenant = Company** (UI: "Perusahaan"; code keeps the
generic `Tenant` / `tenantId`), **Branch = office / work location**, tenant
roles are `owner / hr_admin / manager / employee` (replacing the generic
`owner/manager/cashier`). An **Employee** is a domain row that may exist
without a login. Wherever a document shows `Tenant`, `Branch` or role names,
read them in this light, but keep the rules.

---

## File map

| File | Covers |
|---|---|
| `01-architecture.md` | Stack, the four surfaces, directory layout, layering rules, env vars |
| `02-database-schema.md` | Full Prisma schema for the platform layer + conventions |
| `03-auth-and-sessions.md` | Two audiences, auth facade, JWT, OAuth + handoff, resets, invitations, impersonation |
| `04-rbac.md` | Platform RBAC (DB-driven), tenant role presets, branch scoping, server gatekeepers |
| `05-tenancy-and-onboarding.md` | Tenant model, signup, onboarding, team invites, suspend/delete/export |
| `06-plans-and-entitlements.md` | Plans as config, limits/features, 402 vs 403, downgrade rules, trial guard |
| `07-subscription-lifecycle.md` | Subscription state machine, events, checkout, cancel, grace, renewal |
| `08-payment-gateway.md` | Driver contract, Nexadream Payment Hub driver, webhooks, dedupe, replay, reconciliation |
| `09-admin-backoffice.md` | Every `/admin` screen, its endpoints and permissions |
| `10-platform-settings.md` | The settings catalog, storage, secrets, caching, how admin edits them |
| `11-notifications-and-email.md` | In-app bell, email (SMTP), push (FCM), templates, scheduled broadcasts |
| `12-api-conventions.md` | `/api/app` vs `/api/v1`, envelope, error codes, pagination, API keys, docs catalog |
| `13-tenant-console.md` | `/app` front-end: auth client, middleware, shells, billing page, upgrade dialog |
| `14-landing-and-public-site.md` | Marketing site, public endpoints, CMS pages, FAQ, contact form, SEO |
| `15-cron-jobs.md` | Scheduled jobs, open-but-throttled cron endpoints |
| `16-cross-cutting.md` | Storage/uploads, audit log, crypto, rate limits, analytics, language, money, time |
| `17-implementation-plan.md` | Build order, verification, definition of done, pitfalls |
| `18-domain-layer-guide.md` | How to add the HRIS domain modules (employee, attendance, leave, payroll ...) on top of the platform |

---

## The non-negotiables (summary)

These are repeated in detail in the relevant files. If an implementation
violates one of them it is wrong, however well it works in a demo.

1. **Every tenant-owned row carries `tenantId`**, and every tenant handler
   filters by it through `requireTenantContext()`. A Prisma call in a tenant
   handler without `tenantId` in its `where` is a bug.
2. **Only `transitionSubscription()` writes `Subscription.status`**, and every
   write to `Subscription` also appends a `SubscriptionEvent`.
3. **Plan limits and features are data, not code.** Read them only through
   the entitlements module; the code fixes only the *keys*.
4. **402 means "your plan doesn't allow this"; 403 means "your role doesn't".**
   Never mix them.
5. **Payment amounts are integers in the smallest currency unit.** Never
   `Float`. Non-gateway money is `Decimal(14,2)` in the DB and a plain number
   over the wire.
6. **Never fulfil a payment from callback content you cannot verify.** With the
   Payment Hub, the callback is only a nudge — re-read the status from the hub.
7. **Provider vocabulary lives only in its adapter file** (payment, storage,
   email, push, auth providers).
8. **Downgrade never deletes data.** Excess resources are deactivated and come
   back on upgrade.
9. **Secrets at rest are encrypted** (AES-256-GCM) and **never returned raw**
   over the wire — masked.
10. **`/api/v1` is frozen once published.** Add endpoints and optional fields;
    never remove or rename. Breaking change = `/api/v2`.
11. **Both `/api/app/**` and `/api/v1/**` are thin handlers over the same
    `server/utils/*` functions.** Logic lives in the util, never in a handler.
12. **User-facing text in Bahasa Indonesia; everything a developer reads
    in English.** Enum values, codes, field names stay English; labels come
    from a label map.
13. **Reference data ships through migrations**, not through the seed.
14. **Vercel serverless.** No long-running processes, timers or in-process
    queues; in-memory state is per instance and best-effort only; durable
    state lives in the database; no local filesystem writes (uploads go through
    the storage adapter); scheduled jobs are Vercel Cron entries in
    `vercel.json` hitting plain `GET /api/cron/*` endpoints.
15. **Sensitive HR data is protected** (D7): NIK, NPWP, BPJS numbers, bank
    account, salary and family data are encrypted at rest, masked in lists,
    readable only with an explicit ability, and every read is audit-logged
    (UU PDP).
16. **The platform never moves salary money** (D5). Payroll is calculated and
    recorded; the Payment Hub is only for company -> platform subscriptions.
