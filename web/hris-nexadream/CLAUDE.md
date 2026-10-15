# HRIS Nexadream — Web App

Nuxt 4 app: landing (`/`), company console (`/app`, incl. employee self-service
`/app/me`), back-office (`/admin`) and API (`/api/*`). Deployed on Vercel
serverless (`nitro.preset = 'vercel'`). Read the workspace `../../CLAUDE.md`,
`../../tasks/tasks.md` and `../../tasks/DECISIONS.md` first; the spec is in
`../../saas-blueprint/`.

## Commands

```bash
npm install            # postinstall: nuxt prepare + prisma generate
npm run dev            # http://localhost:3000
npm run lint           # must be clean
npm run typecheck      # must be clean
npm test               # node:test via tsx (tests/*.test.ts)
npm run prisma:migrate # new migration (needs DATABASE_URL)
npm run db:seed        # idempotent seed (superadmin + demo company in non-prod)
```

Dev logins after seeding: superadmin `admin@nexadream.id`; demo company
`owner@ / hr@ / manager@ / employee@demo.nexadream.id`; password =
`DEV_PASSWORD` in `prisma/seed.ts` (dev only — production requires
`SEED_SUPERADMIN_PASSWORD` and skips the demo company).

## Layout

| Path | What |
|---|---|
| `shared/utils/*` | Catalogs shared by server + client: `permissions`, `tenant-abilities`, `plans`, `menus`, `settings`, `status`, `templates`, `payments`, `phone`, `auth-rules`, `hr` (HR enums/labels), `payroll-rules` (PPh 21/BPJS/overtime/THR — pure, tested), `csv`, `api-docs` (v1 catalog), `timezone` |
| `server/services/auth/*` | Auth adapter. **Only** `index.ts` is imported by business code; only `providers/credentials.ts` imports bcrypt; only `sessions/jwt.ts` imports jsonwebtoken |
| `server/utils/*` | Business logic (auto-imported in server code). Gatekeepers in `auth.ts` |
| `server/api/{app,admin}/**` | Thin handlers: validate → call one util → return |
| `prisma/` | `schema.prisma` (Prisma 7, generator `prisma-client` → `generated/prisma`), migrations, seed |
| `app/` | Pages, layouts (`public`, `tenant`, `auth-tenant`, `admin`, `auth-admin`), shells, composables |
| `tests/` | Unit tests (RBAC matrix, crypto, catalogs, payroll rules, CSV, branch-local time) |

## Rules that are easy to break

- In server code, import from `#shared/utils/*` explicitly. Auto-imports of a *new* shared file are not
  picked up by a running dev server (caused a 500 after commit once).
- Side effects after a committed transaction (email, bell, staff notify) are wrapped so they can never
  fail the request; network calls never run inside a transaction (`createNotification(input, tx)` writes
  only the bell row — call `deliverNotification()` after commit).
- Notification/email copy never contains sensitive values (D7): say *that* something is ready, link to it.
- Plan gates on the client: use `useEntitlements()`; tenant pages report errors with `useApiToast().error()`,
  which routes every 402 to `<UpgradeDialog>`. Paid nav entries are locked, never hidden.
- zod default messages are Indonesian via `z.locales.id()` (server + client plugins); still write explicit messages.
- Raw SQL: never `now()`/`CURRENT_TIMESTAMP` (DB session TZ may not be UTC) — pass JS Dates (D17).
- zod: never `.partial()` a schema that has `.default()`s for PATCH — defaults get applied to omitted fields.
- Billing: only `transitionSubscription()` writes `Subscription.status`; payment results go through
  `applyPayment()`; nothing under `server/services/payments` may be imported by payroll code (D5).
  Local payments: point the gateway's base URL at `http://localhost:3000/_dev-hub` (mock hub, dev only).
- Keep per-request DB parallelism modest (≤ ~6 queries in one Promise.all) — serverless + pooled Neon.
- Never `clearNuxtState()` without re-initialising the cleared keys (live refs become `undefined`).
- Impersonation: sensitive reads in tenant code must call `assertSensitiveReadAllowed(event, …)`.
- Import Prisma types/client from `~~/generated/prisma/client` (not `@prisma/client`).
- Every tenant query filters by `tenantId` from `requireTenantContext()`; one
  `require*` gatekeeper per handler/util. Role check (403) before plan check (402).
- Tenant role abilities live in `shared/utils/tenant-abilities.ts`; that file's
  ability keys are canonical (the blueprint's examples are illustrative).
- `employee` holds only the self abilities; self routes live under `/app/me/**`
  and `/api/app/me/**` and never take an `employeeId` from the client.
- Errors: `httpError(status, CODE, 'Kalimat Bahasa Indonesia')` — message is shown verbatim.
- Client HTTP: always `apiFetch` (attaches the right bearer token per audience).
- In-memory caches/rate limits are per Vercel instance and best-effort only.
- New permission/menu/setting/template/plan → shared catalog **and** an
  idempotent insert in a new migration (the seed does not run in production).
- Public site: never hard-code prices, limits, FAQ or legal text in pages — read
  `/api/public/landing` / `/api/public/site`; legal pages use `{{TOKEN}}`s filled from
  settings (`PAGE_TOKENS` in `server/utils/cms.ts`). Custom-priced plan = `isCustomPricedPlan()`.
- Unbuilt console routes render `<ComingSoon>` via catch-all pages.
- **Never call the global `prisma` (or any helper that does: `can`, `getHrSettings`, `ownEmployee`,
  `buildScheduleResolver`, `planApprovalSteps`, …) inside `prisma.$transaction(async tx => …)`.**
  Resolve everything first, then write with `tx` only (deadlocked the pool in testing).
- Nested parallelism counts: a helper that runs its own `Promise.all` must not sit inside another
  `Promise.all`. Pool size is `DB_POOL_MAX` (default 5) per instance.
- HR domain: scope employees with `visibleEmployeesWhere`/`employeeScopeWhere`/`requireEmployeeAccess`;
  self routes use `requireOwnEmployee`; every sensitive read goes through `auditSensitiveRead`;
  encrypt with `encryptHr`/`encryptHrJson`. Payroll rates come from `getPayrollReference()` — never literals.
- `/api/v1` handlers use `defineApiV1Handler` (pass `{ apiKey: true }` only for integrator endpoints)
  and every v1 endpoint needs an entry in `shared/utils/api-docs.ts` + `API_CHANGELOG.md`.
- Vue templates: build `{ label, value }` option arrays in `<script>`, not inline in the template (vue-tsc).
