# 01 — Architecture

HRIS Nexadream web app lives at `web/hris-nexadream/` (Nuxt 4 on Vercel
serverless; see D9 in `../tasks/DECISIONS.md`). All paths below are relative to
that folder.

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Nuxt 4** (Vue 3, Nitro server) | One repo serves the landing site, both consoles and the API |
| UI kit | **Nuxt UI v4** (Tailwind v4, Reka UI) | Do not hand-roll components it already provides |
| Database | **PostgreSQL** (Neon, pooled connection) | Separate DB branch per environment; the pooler is mandatory on Vercel (many short-lived instances) |
| Hosting | **Vercel serverless** | Functions are short-lived and stateless; background work is awaited or handed to `waitUntil`; cron = Vercel Cron (§7) |
| ORM | **Prisma 7** with `@prisma/adapter-pg` | URL is *not* in `schema.prisma` (see §6) |
| Validation | **zod 4** | Messages are user-facing → Bahasa Indonesia |
| Auth | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`, cost 10) | Behind an adapter facade; nothing outside it knows |
| Email | `nodemailer` over SMTP | SMTP credentials live in DB settings, not env |
| Push | Firebase Cloud Messaging HTTP v1 (called with `jsonwebtoken`, no `firebase-admin`) | Optional |
| Storage | Supabase Storage or any S3-compatible bucket | Chosen by env `STORAGE_PROVIDER`; the only place files are written (Vercel's filesystem is read-only except `/tmp`) |
| Payments | **Nexadream Payment Hub** driver (+ scaffolded alternates) | Behind a driver contract |
| Rich text | TipTap (admin CMS editor only) | Lazy-loaded |
| Lint | `@nuxt/eslint` stylistic: `commaDangle: 'never'`, `braceStyle: '1tbs'` | |

`package.json` scripts:

```json
{
  "build": "prisma migrate deploy && nuxt build",
  "dev": "nuxt dev",
  "preview": "nuxt preview",
  "postinstall": "nuxt prepare && prisma generate",
  "lint": "eslint .",
  "typecheck": "nuxt typecheck",
  "prisma:migrate": "prisma migrate dev",
  "prisma:deploy": "prisma migrate deploy",
  "prisma:studio": "prisma studio",
  "db:seed": "tsx prisma/seed.ts",
  "db:reset": "prisma migrate reset --force && npm run db:seed"
}
```

`version` in `package.json` is surfaced as `runtimeConfig.public.appVersion`
(shown in the `/admin` sidebar footer and admin login page).

---

## 2. Four surfaces, four route boundaries

```
/                 Marketing landing site     SSR, anonymous, indexable
/app/**           Tenant console             SPA (ssr: false), tenant token
/admin/**         Platform back-office       SPA (ssr: false), platform token
/docs/api         Public API documentation   SSR, anonymous, indexable

/api/public/**    Anonymous data for the landing site (plans, FAQ, company)
/api/app/**       Private API of the tenant console (bearer tenant token)
/api/admin/**     Private API of the back-office (bearer platform token)
/api/v1/**        Public, versioned, enveloped API (mobile app + integrators)
/api/webhooks/**  Payment gateway callbacks (no auth middleware)
/api/cron/**      Scheduled jobs (open, throttled)
```

`nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  ssr: true,
  routeRules: {
    '/app/**': { ssr: false },
    '/admin/**': { ssr: false }
  },
  nitro: {
    experimental: { asyncContext: true },
    // Shapes /api/v1 errors into the envelope; everything else falls through.
    errorHandler: '~~/server/error'
  },
  colorMode: { preference: 'light', fallback: 'light' },
  runtimeConfig: {
    jwtSecret: process.env.JWT_SECRET || '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    authSessionDriver: process.env.AUTH_SESSION_DRIVER || 'jwt',
    settingsSecret: process.env.SETTINGS_SECRET || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    storageProvider: process.env.STORAGE_PROVIDER || 'supabase',
    // …storage credentials…
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      appEnv: process.env.NUXT_PUBLIC_APP_ENV || 'development',
      supportEmail: process.env.NUXT_PUBLIC_SUPPORT_EMAIL || '',
      appVersion: pkg.version
    }
  }
})
```

Consequences:

- The global route middleware **short-circuits on the server**
  (`if (import.meta.server) return`) because both consoles are client-only.
- Marketing pages and `/docs/api` are server-rendered for SEO;
  `server/routes/robots.txt.ts` and `server/routes/sitemap.xml.ts` exist.
- The mobile app talks only to `/api/v1`. It never calls `/api/app/**` and
  never touches `/admin`.

---

## 3. Directory layout

```
app/
  app.vue, app.config.ts, error.vue
  assets/css/main.css            design tokens (@theme), no tailwind.config.js
  layouts/
    public.vue                   landing + CMS pages
    tenant.vue / auth-tenant.vue /app shell and its auth pages
    admin.vue  / auth-admin.vue  /admin shell and its auth pages
  middleware/auth.global.ts      route boundary guard (client only)
  composables/                   useTenantAuth, usePlatformAuth, useAuthClient,
                                 useEntitlements, useNotifications, usePageState,
                                 useServerList, useConfirmDialog, useAdminImpersonation …
  components/                    TenantShell, AdminShell, CommandBar, StatusBadge,
                                 UpgradeDialog, TrialBanner, ImpersonationBanner …
  pages/
    index.vue, privacy.vue, terms.vue, page/[slug].vue, docs/api.vue
    app/…                        tenant console pages
    admin/…                      back-office pages
  utils/api-fetch.ts             the authenticated $fetch wrapper (apiFetch)
  utils/format.ts                currency / date formatting

server/
  api/
    public/  app/  admin/  v1/  webhooks/payments/[provider].post.ts  cron/
    contact.post.ts
  middleware/mobile-version.ts   426 for outdated mobile builds
  plugins/api-envelope.ts        wraps /api/v1 success bodies in { data }
  error.ts                       wraps /api/v1 errors in { error }
  routes/robots.txt.ts, sitemap.xml.ts, manifest.webmanifest.ts
  services/                      ADAPTERS — the only files that know a vendor
    auth/       types.ts, index.ts (facade), providers/*, sessions/jwt.ts
    payments/   types.ts, index.ts (registry), nexadream-hub.ts, <other>.ts
    notifications/ types.ts, dispatch.ts, email.ts, push.ts, fcm.ts
    storage/    types.ts, index.ts, supabase.ts, s3.ts
  utils/                         BUSINESS LOGIC — one module per concern
    prisma.ts, auth.ts (gatekeepers), entitlements.ts, subscriptions.ts,
    checkout.ts, payment-apply.ts, payment-reconcile.ts, registration.ts,
    onboarding.ts, team.ts, settings.ts, crypto.ts, audit.ts, notifications.ts,
    email.ts, api-response.ts, api-keys.ts, rate-limit.ts, password-reset.ts,
    uploads.ts, validate.ts, cron.ts, last-seen.ts, account.ts, …
    <domain>.ts                  HRIS domain modules: employees.ts, departments.ts,
                                 attendance.ts, leave.ts, overtime.ts, payroll.ts … (see 18)

shared/utils/                    CATALOGS — imported by server AND client
  plans.ts         LIMIT_KEYS, FEATURE_KEYS, labels, normalizers
  permissions.ts   platform permission keys (typed)
  tenant-abilities.ts tenant roles → abilities, presets
  menus.ts         default /admin menu tree + tenant nav
  settings.ts      settings catalog
  payments.ts      payment provider catalog + status vocabulary
  templates.ts     default email + notification templates, renderer
  status.ts        every enum's display label + badge colour
  api-docs.ts      the API documentation catalog (feeds /docs/api + OpenAPI)
  email-brand.ts   HTML email wrapper
  uploads.ts, phone.ts, select.ts, breadcrumbs.ts …

prisma/
  schema.prisma, seed.ts, migrations/
prisma.config.ts                 where the Prisma CLI reads DATABASE_URL
vercel.json                      Vercel Cron schedule (GET /api/cron/*), see §7
```

---

## 4. Layering rules

```
  page / composable ──apiFetch──▶ /api/app/** handler ─┐
  mobile app ───────────────────▶ /api/v1/** handler ──┼──▶ server/utils/<domain>.ts ──▶ prisma
  admin page ──apiFetch─────────▶ /api/admin/** handler┘            │
                                                                     └──▶ server/services/<adapter> ──▶ vendor
```

1. **Handlers are thin.** A handler: picks a gatekeeper, validates input with
   zod, calls one util function, returns. If `/api/app` and `/api/v1` both
   expose a capability, both handlers call the *same* util function. Four-line
   handlers are the norm:

   ```ts
   // server/api/v1/subscription/checkout.post.ts
   export default defineEventHandler(async (event) => {
     assertJsonRequest(event)
     const body = await readValidatedJson(event, checkoutSchema)
     return ok(await startCheckout(event, body))
   })
   ```

2. **Utils own the rules** (authorization calls included — a util such as
   `startCheckout(event, input)` calls `requireTenantAbility` itself, so no
   surface can forget it).
3. **Services are adapters.** Business code imports only from
   `server/services/<x>/index.ts` and `types.ts`. Vendor names, hosts, status
   strings and SDKs never appear outside the adapter file. Adding a vendor =
   one file + one line in a registry (+ one catalog entry for payments).
4. **Shared catalogs are the single source** of keys, labels and defaults for
   both server and client — permission keys, plan keys, settings, templates,
   status labels. Compile-time typed.

---

## 5. Environment variables

```bash
# Database (pooled connection)
DATABASE_URL="postgresql://user:pass@host-pooler/db?sslmode=require"

# Auth
JWT_SECRET=""            # long random string; REQUIRED in production
JWT_EXPIRES_IN="7d"
AUTH_SESSION_DRIVER="jwt"
SETTINGS_SECRET=""       # AES key source for secrets at rest; falls back to JWT_SECRET
                         # (also keys the AES-256-GCM helper that encrypts NIK/NPWP/BPJS/bank/salary, D7)

# Optional Google sign-in (button hidden/explained when empty)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""  # redirect URI: ${SITE_URL}/api/app/auth/oauth/google/callback

# App
NUXT_PUBLIC_SITE_URL="http://localhost:3000"   # prod: https://hris.nexadream.id
NUXT_PUBLIC_APP_ENV="development"   # 'production' switches API keys to *_live_
NUXT_PUBLIC_SUPPORT_EMAIL=""       # prod: support@nexadream.id

# Push (optional; empty disables the channel)
FIREBASE_SERVICE_ACCOUNT=""         # base64 of the service-account JSON
NUXT_PUBLIC_FIREBASE_VAPID_KEY=""

# Storage
STORAGE_PROVIDER="supabase"         # or "s3"
SUPABASE_URL="" SUPABASE_SECRET_KEY="" SUPABASE_STORAGE_BUCKET="public"
S3_ACCESS_KEY_ID="" S3_SECRET_ACCESS_KEY="" S3_BUCKET="" S3_REGION="auto"
S3_ENDPOINT="" S3_FORCE_PATH_STYLE="false" S3_PUBLIC_URL_BASE=""
```

**Not** in env, on purpose (they live in the DB and are edited in `/admin`):
SMTP credentials, payment gateway credentials, company identity, billing
rules, trial rules, maintenance mode, minimum mobile version.

---

## 6. Prisma 7 + Neon specifics

- `schema.prisma` datasource has **no `url`**. `prisma.config.ts` (repo root)
  is where the CLI reads `DATABASE_URL`.
- Runtime client (`server/utils/prisma.ts`):

  ```ts
  import { PrismaClient } from '@prisma/client'
  import { PrismaPg } from '@prisma/adapter-pg'

  const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

  function createPrismaClient() {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL is not set.')
    return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  }

  export const prisma = globalForPrisma.prisma ?? createPrismaClient()
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
  ```

- Use the **pooled** host with `?sslmode=require`. If a migration fails
  against the pooler (transaction-mode PgBouncer), run that one command with
  the direct host.
- Never point a local `.env` at production.

---

## 7. Per-instance caches and scheduled jobs (Vercel serverless)

The app runs on Vercel serverless (D9): every request may land on a different,
short-lived function instance, and anything after the response can be killed.
Therefore:

- **In-memory state is per instance and best-effort only.** Never rely on it
  for correctness. Durable state (anything that must be right across
  instances: rate-limit decisions that guard money or security, cron
  idempotency, dedupe, claims) goes in the database. Caches may be stale or
  empty on any request; the code must still be correct.
- **No timers, intervals or in-process queues.** Work that must finish is
  awaited before responding, or handed to the platform's `waitUntil`.
- **Cache on `globalThis` only to survive hot reload / warm reuse**, never as
  the source of truth.

| Cache | TTL | Invalidated by | Serverless note |
|---|---|---|---|
| Settings (`getAllSettings`) | 60 s | `setSetting()` / `setSettings()` | Other instances see an edit within 60 s; acceptable |
| Entitlements per tenant | 60 s | `invalidateEntitlements(tenantId?)` after any plan/subscription/branch change | Same; a limit check that must be exact (`assertWithinLimit`) counts rows in the DB |
| Rate-limit buckets | window | time | Per instance = soft throttle only; for login/OTP abuse that matters, back it with a DB counter |
| Cron throttle | 60 s per job | time | Best-effort; the job steps themselves must be idempotent, so a double run is harmless |
| `lastSeenAt` debounce | 15 min per user | time | Worst case a few extra writes |
| SMTP transporter | until config changes | key = serialized SMTP config | Rebuilt on cold start |

**Scheduled jobs = Vercel Cron.** Declare them in `vercel.json`; Vercel calls
plain public `GET /api/cron/*` endpoints (no auth header, throttled,
idempotent; see `15-cron-jobs.md`):

```json
{
  "crons": [
    { "path": "/api/cron/subscriptions", "schedule": "0 * * * *" }
  ]
}
```

Add one entry per job (billing, notification dispatch, retention purge,
payroll/leave accrual jobs once the domain exists). Keep each run short; split
long work into batches that a later invocation continues.
