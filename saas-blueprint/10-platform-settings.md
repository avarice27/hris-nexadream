# 10 — Platform Settings (how admin configures the platform)

Global configuration that must change **without a deploy** lives in the
`app_settings` table, is described by **one catalog in code**, is edited at
`/admin/settings`, and is read through **one server module**.

## 1. What goes where

| Kind of value | Where | Why |
|---|---|---|
| Infrastructure secrets (DB URL, JWT secret, storage keys, FCM service account, OAuth client secret) | env | needed before the DB is reachable / per environment |
| Business configuration (company identity, SMTP, billing rules, privacy numbers, app flags) | `app_settings` | owner/staff must change it without a release |
| Payment gateway credentials | `payment_gateways` (own table, own screen) | structured, per-provider, one active |
| Plan tiers | `plans` | structured JSON limits/features |
| Statutory rates (PPh 21 TER, BPJS, UMK, PTKP, holidays) | `ref_*` tables via migration (§9) | versioned by `effectiveFrom`; staff-editable only with a permission |
| Copy of emails / notifications | `email_templates`, `notification_templates` | editable content |
| Legal and help pages, FAQ | `pages`, `faqs` | CMS |

## 2. The catalog — `shared/utils/settings.ts`

```ts
export type SettingType = 'string' | 'number' | 'boolean' | 'json' | 'secret' | 'text' | 'select'

export interface SettingDef {
  key: string                 // English, dotted: 'billing.gracePeriodDays'
  group: SettingGroup
  type: SettingType
  label: string               // product language — form label
  hint?: string               // product language — help text
  default: string             // always a string; parsed by the reader
  isSecret?: boolean          // password field, encrypted at rest, masked on read
  options?: { value: string, label: string }[]   // required for 'select'
}

export const SETTING_GROUPS = ['company', 'smtp', 'billing', 'privacy', 'app', 'hr'] as const

export const SETTING_GROUP_META: Record<SettingGroup, { label, description, icon }> = {
  company: { label: 'Perusahaan', description: 'Identitas yang tampil di situs, email dan faktur.', icon: 'i-lucide-building' },
  smtp:    { label: 'Email keluar (SMTP)', description: 'Server pengirim email. Kosongkan host untuk mematikan pengiriman email.', icon: 'i-lucide-mail' },
  billing: { label: 'Penagihan', description: 'Aturan uji coba, masa tenggang dan penurunan paket.', icon: 'i-lucide-credit-card' },
  privacy: { label: 'Privasi & data', description: 'Kebijakan penyimpanan data pelanggan.', icon: 'i-lucide-shield-check' },
  app:     { label: 'Aplikasi', description: 'Perilaku aplikasi web dan mobile.', icon: 'i-lucide-settings-2' },
  hr:      { label: 'Bawaan SDM', description: 'Nilai awal untuk perusahaan baru (zona waktu, kebijakan cuti, jam kerja). Perusahaan dapat mengubahnya sendiri.', icon: 'i-lucide-users' }
}

export const SETTINGS_CATALOG: SettingDef[] = [ /* see §3 */ ]
export const SETTINGS_BY_KEY: Record<string, SettingDef>
export function settingDefault(key: string): string
export const MASKED_SECRET = '••••••••'
```

The catalog is used three ways:
1. the **seed** (and migrations) write each key with its default;
2. the **admin form** renders itself from it (group tabs, field per type);
3. `getSetting()` **falls back** to the catalog default when a row is missing
   (so a newly added key works before any migration seeds it).

## 3. Full settings list (generic platform + HRIS defaults)

> Naming: `company.*` is **Nexadream's own** identity (the platform vendor).
> A customer company is a *tenant* and its own profile lives in the tenant
> table, never here.

### company — shown on the site, in emails, invoices, footer
| Key | Type | Default / meaning |
|---|---|---|
| `company.name` | string | `HRIS Nexadream` (= `{{APP_NAME}}`) — also the email brand name |
| `company.tagline` | string | landing hero / meta, e.g. "Kelola karyawan, absensi, cuti dan penggajian dalam satu tempat" |
| `company.legalName` | string | legal entity printed on invoices (placeholder until the owner supplies it) |
| `company.siteUrl` | string | `https://hris.nexadream.id` (= `{{SITE_URL}}`); absolute-link base for emails |
| `company.email` | string | `support@nexadream.id` (= `{{SUPPORT_EMAIL}}`) — contact + support address; contact-form copies go here |
| `company.phone` | string | |
| `company.address` | text | |
| `company.whatsapp` | string | `62xxxx` without `+`; **empty hides** the WhatsApp button (no placeholder numbers — they become live links) |
| `company.logoUrl` | string | used in the email header |
| `company.instagram`, `company.facebook`, `company.tiktok`, `company.youtube` | string | full URLs; empty hides the icon |
| `company.playStoreUrl` | string | Android listing; empty hides the badge and the app's update button falls back |

### smtp — outgoing email (empty host = email silently disabled)
| Key | Type | Default |
|---|---|---|
| `smtp.host` | string | `''` |
| `smtp.port` | number | `587` |
| `smtp.secure` | boolean | `false` (true for implicit TLS on 465) |
| `smtp.user` | string | |
| `smtp.password` | secret | encrypted |
| `smtp.fromName` | string | `{{APP_NAME}}` |
| `smtp.fromEmail` | string | `{{SUPPORT_EMAIL}}` |

### billing — trial, grace and downgrade rules
| Key | Type | Default | Used by |
|---|---|---|---|
| `billing.gracePeriodDays` | number | `3` | `payment_failed` → `graceEndsAt` |
| `billing.trialReminderDays` | number | `3` | cron trial reminder window |
| `billing.trialPlanSlug` | string | `business` | signup trial plan, `start_trial` (proposed; D4 trial = 14 days on paid tiers, length lives on the plan's `trialDays`, not here) |
| `billing.defaultPlanSlug` | string | `free` | downgrade target (D4: 10 employees, 1 branch) |
| `billing.oneTrialPerEmail` | boolean | `true` | `TrialClaim` guard at signup (guards the **owner** email; also consider NPWP/company name later — open) |
| `billing.invoiceTaxRatePercent` | number | `11` | PPN shown on subscription invoices; proposed, confirm with accountant. Display only — amounts sent to the hub stay integers |

### privacy — data protection commitments (some are printed on public pages)
| Key | Type | Default | Used by |
|---|---|---|---|
| `privacy.retentionMonths` | number | `24` | documented retention of platform-side personal data (company owners/team logins). **Employee HR data belongs to the company** (we are the processor under UU PDP): on company deletion it is erased after `privacy.backupRetentionDays` rotation; companies export it first (`/account/export`) |
| `privacy.dataProtectionOfficer` | string | support email | contact on the account-deletion page |
| `privacy.deleteRequestSlaDays` | number | `30` | deletion request response + public page |
| `privacy.auditRetentionDays` | number | `90` | audit purge horizon (all audiences); caps every plan's activity-log window |
| `privacy.backupRetentionDays` | number | `30` | printed on the deletion page — must match real backup rotation |
| `privacy.financialRetentionYears` | number | `10` | payment records kept after deletion (tax law) |

### app — behaviour of web and mobile
| Key | Type | Default | Used by |
|---|---|---|---|
| `app.minimumMobileVersion` | string | `1.0.0` | `/api/v1/settings/public` + 426 middleware |
| `app.maintenanceMode` | boolean | `false` | public settings → clients show a maintenance screen |
| `app.maintenanceMessage` | text | localized sentence | shown with maintenance mode |
| `app.registrationOpen` | boolean | `true` | `registerOwner` → 503 when false; landing hides sign-up CTA |
| `app.internalApiDocsEnabled` | boolean | `false` | serves `/internal/api` + `?scope=internal` on the OpenAPI doc |
| `app.contactRateLimitPerHour` | number | `5` | contact form per IP |
| `display.timezone` | select | `Asia/Jakarta` | the clock the back-office renders dates on (options = supported timezones) |

### hr — platform-level defaults for new companies (proposed; don't over-build)
Only values that seed a **new** company. Once a company is created it owns a
copy; changing these later never rewrites existing companies.

| Key | Type | Default | Used by |
|---|---|---|---|
| `hr.defaultTimezone` | select | `Asia/Jakarta` | options `Asia/Jakarta` (WIB), `Asia/Makassar` (WITA), `Asia/Jayapura` (WIT); default for a new branch (each branch keeps its own) |
| `hr.defaultWorkdaysPerWeek` | select | `5` | `5` or `6`; seeds the first work schedule |
| `hr.defaultWorkStart` / `hr.defaultWorkEnd` | string | `08:00` / `17:00` | seeds the default shift |
| `hr.defaultLeavePolicyTemplate` | json | annual leave 12 days after 12 months of service, sick leave (with doctor's note), maternity 3 months, marriage 3 days, bereavement per UU Ketenagakerjaan; carry-over off | copied into a new company's leave types; company edits its own copy |
| `hr.defaultPayDay` | number | `25` | proposed default pay day shown on payslips (recorded date only — no money moves, D5) |
| `hr.attendanceGeofenceRadiusMeters` | number | `100` | default radius when a company turns on `attendanceGeofence` |

Statutory rates are **not** settings — see §9.

## 4. Server module — `server/utils/settings.ts`

The **only door** to `app_settings`. Business code never queries the table.

```ts
getAllSettings(): Promise<Record<string, string>>
  // catalog defaults, overlaid with DB rows; secrets decrypted; 60 s process cache
getSetting(key): Promise<string>
getSettingNumber(key, fallback = 0): Promise<number>   // NaN → fallback
getSettingBool(key): Promise<boolean>                   // 'true' | '1'
setSetting(key, value)                                  // upsert; encrypts when def.isSecret; invalidates cache
setSettings(entries)                                    // loop + invalidate
invalidateSettingsCache()
claimSettingValue(key, value): Promise<boolean>
  // atomic compare-and-set used as a durable "once per day" lock by cron jobs:
  // updateMany where value != given → count>0 ⇒ claimed; else try create; unique violation ⇒ not claimed.
  // Stored in group 'system', not in the catalog, so the admin form never shows it.
```

Values are always strings in the DB; typed parsing happens in the reader
helpers. Secrets: stored as `enc:v1:<iv>:<tag>:<ciphertext>` (see
`16-cross-cutting.md` §3); `decrypt()` passes plain (legacy/hand-edited) values
through unchanged and returns `''` for undecryptable values (rotated key) so
one bad row cannot break the settings screen.

## 5. Admin API

```
GET   /api/admin/settings                (settings.read)
  → { catalog: SETTINGS_CATALOG,
      values: { [key]: value } }     // secrets: MASKED_SECRET if stored, '' if not — never the value

PATCH /api/admin/settings               (settings.write)
  body: { values: Record<string, string> }
  for each entry:
    unknown key                         → ignored (a stale form can't fail the save)
    secret && value === MASKED_SECRET   → skipped (= keep stored)
    select && value not in options      → skipped
  setSettings(updates) → { success, updated: count }

POST  /api/admin/settings/test-email    (settings.write)
  body: { to }
  smtp.host empty → 409 "save SMTP settings first"
  send a short test message; failure → 502 with the transport error text
```

## 6. Admin UI (`/admin/settings`)

- One tab (or section) per `SETTING_GROUPS` entry with
  `SETTING_GROUP_META` label, description and icon.
- Field by type: `string` → input; `text` → textarea; `number` → numeric
  input; `boolean` → switch; `secret` → password input pre-filled with the
  mask (unchanged mask = keep); `select` → select with `options`; `json` →
  code textarea.
- `hint` under each field. One save button per form (sends only that group's
  values or all — both are safe because of the server rules above).
- SMTP section has a "Kirim email uji" button with a recipient field.
- After saving, the server cache is cleared immediately; other processes pick
  it up within 60 s.

## 7. Public exposure (read-only, no secrets)

| Endpoint | Exposes | Consumer |
|---|---|---|
| `GET /api/public/site` | company identity + social links + Play URL; privacy commitments (contact, SLA, audit/backup/financial retention) | every public page footer, `/hapus-akun` |
| `GET /api/public/landing` | plans (active+public), FAQ, company, `registrationOpen` | landing page (SSR) |
| `GET /api/v1/settings/public` (ETag) | company, `minimumMobileVersion`, `playStoreUrl`, `maintenanceMode`, `maintenanceMessage`, `registrationOpen`, supported timezones | mobile app before login |

Never add a secret or SMTP/gateway detail to these.

## 8. Adding a new setting (checklist)

1. Add a `SettingDef` to `SETTINGS_CATALOG` (English key, localized label/hint,
   string default, `isSecret` if sensitive).
2. Ship it to existing databases with an idempotent migration insert
   (`ON CONFLICT ("key") DO NOTHING`, explicit `updatedAt`) — or rely on the
   catalog fallback if the default is acceptable until an admin saves.
3. Read it with `getSetting*()`; never cache it yourself.
4. If a public page or the app needs it, add it explicitly to the relevant
   public endpoint.

## 9. Statutory reference data (HRIS — proposed)

Indonesian payroll rules change by regulation, not by our release cycle, and
a wrong rate is a legal/financial error for every customer. So they are
**reference data**, not settings and not hard-coded constants:

- Tables (names proposed): `ref_pph21_ter_rates` (TER category A/B/C brackets),
  `ref_pph21_ptkp` (PTKP by status TK/K/…), `ref_bpjs_rates` (Kesehatan and
  Ketenagakerjaan: JHT, JKK risk classes, JKM, JP, wage caps),
  `ref_minimum_wages` (UMP/UMK per region), `ref_public_holidays` (national
  holidays + cuti bersama per year).
- **Shipped via migrations** (idempotent insert with `effectiveFrom`), so every
  environment gets the same rows and history is reviewable in git.
- **Versioned, never overwritten**: each row has `effectiveFrom`/`effectiveTo`;
  payroll for a period reads the row effective on that period's date, so
  re-running last month gives last month's result.
- Editable **only** at `/admin/reference-data` (see `09` §2.5) by staff with
  `reference-data.write` (proposed key); reads need `reference-data.read`;
  edits create a new version and are audited `reference_data.update`. Tenants
  (companies) can read but never change them; a company may only add
  company-specific allowances/deductions in its own tables.
- Read through one module (`server/utils/reference-data.ts`) with the same
  60 s process cache rule as settings; never queried from payroll code ad hoc.
- Out of scope for now: auto-fetching rates from government sources.

Public exposure: `GET /api/v1/settings/public` may include
`hr.defaultTimezone`; never statutory tables or any company data.
