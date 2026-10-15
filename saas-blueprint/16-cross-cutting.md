# 16 — Cross-cutting Concerns

## 1. Storage & uploads

Adapter layer like payments:

```
server/services/storage/
  types.ts      StorageDriver contract
  index.ts      facade: uploadObject, deleteObject, getSignedObjectUrl, sniffImageType, assertUploadAllowed, stripExif
  supabase.ts   Supabase Storage driver
  s3.ts         S3-compatible driver (R2, MinIO, AWS)
```

```ts
export interface StorageDriver {
  readonly provider: string
  upload(input: { path: string, body: Buffer, contentType: string, cacheControl?: string, upsert?: boolean }): Promise<{ path: string, url: string }>
  delete(path: string): Promise<void>
  signedUrl(path: string, ttlSeconds: number): Promise<string>
  publicUrl(path: string): string
}
// selected by env STORAGE_PROVIDER ('supabase' | 's3'); unknown name throws at first use
```

Rules (`shared/utils/uploads.ts` shared by browser + server, server is the
authority):

- Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. **No
  SVG** (can carry script → XSS from our origin).
- General ceiling 5 MB; avatars 50 KB (the browser downsizes to ≤ 512 px and
  ~48 KB before sending).
- **Never trust the client**: the type is **sniffed from magic bytes**
  (JPEG `FF D8 FF`, PNG signature, `GIF87a/89a`, `RIFF….WEBP`); the extension
  comes from the sniffed type; the stored filename is generated
  (`<timestamp>-<random>.<ext>`) — the multipart filename never reaches the
  bucket path.
- JPEG EXIF/APPn segments are stripped (removes GPS from phone photos).
- `handleUpload(event, prefix, { maxBytes })` →
  `{ path, url, size, contentType }`. Prefixes: `platform` (staff avatars),
  `tenants/<tenantId>/…` (tenant files).
- Endpoints: `POST /api/app/uploads`, `POST /api/v1/uploads`,
  `POST /api/admin/uploads` (multipart field `file`). The client never talks
  to a storage SDK.
- If the browser must read pixels from stored images (canvas), the bucket must
  send CORS for the site origin.

### 1b. Employee documents (private vault) — plan feature `documentVault`

HR files (KTP/KK scans, NPWP, contracts, certificates, payslip PDFs, medical
notes, reimbursement receipts) are **personal data and are never public**:

- Separate **private bucket** (no public read policy; `publicUrl()` is never
  used for these paths). Path: `tenants/<tenantId>/employees/<employeeId>/<category>/<generated-name>`.
- Access only through `getSignedObjectUrl` with a **short TTL (≤ 5 minutes)**,
  minted by an endpoint that first checks the ability (`documents.read`, or the
  employee reading their own file) and writes an audit row (`document.read`).
  Never store or log a signed URL.
- Allowed types for this bucket (extends the image list above): `application/pdf`
  plus JPEG/PNG/WebP; sniffed from magic bytes (`%PDF-`); size ceiling 10 MB per
  file (proposed); no SVG, no Office macros. Quota counts against the plan's
  `storageMb`; over-quota uploads return 402 with the upgrade dialog.
- Selfies/geofence photos from attendance use the same private bucket and a
  retention window (`attendance.selfieRetentionDays`, proposed 90).
- Deleting a tenant or erasing an employee deletes the objects too (§3b); the
  DB row stores only the path, name, category and size.

## 2. Audit log

`server/utils/audit.ts`:

```ts
recordAudit(event | null, {
  audience: 'tenant' | 'platform',
  action: string,                 // English slug, e.g. 'tenant.suspend'
  actorId?, actorName?, impersonatorId?, tenantId?,
  targetType?, targetId?, metadata?
})
```

- Never throws (an audit write must not fail the action it describes).
- `actorId` FK only for platform users; for tenant actors the id is stored in
  `metadata.tenantUserId` (deleting a tenant user never blocks the trail).
- IP (`clientIp`) and user agent stored in columns; for `auth.*` and
  `tenant.register` actions a readable device description and IP are also put
  in `metadata` so the tenant's own activity log can show "where was this
  sign-in from".
- **Retention**: `privacy.auditRetentionDays` (default 90, nonsense values →
  default). Purge runs opportunistically after inserts (throttled to once per
  hour per process, never awaited) and in the daily cron with `force`, in
  batches of 5 000 via an id subquery (no long-locking unbounded DELETE).
- Labels: `AUDIT_ACTION_LABELS` (action slug → product-language label),
  `AUDIT_METADATA_LABELS`, value maps — never render slugs.

Action vocabulary (extend for the domain):

```
auth.sign_in  auth.sign_in_failed  tenant.register
tenant.suspend  tenant.reinstate  tenant.delete  tenant.delete_request
tenant.impersonate_start  tenant.impersonate_stop  user.impersonate_start  user.impersonate_stop
subscription.plan_change  subscription.downgrade  payment.cancel  payment.webhook_replay
role.update  permission.update
team.invite  team.invite_revoke  team.invite_accept  team.role_change  team.branch_change
team.deactivate  team.reactivate
```

HRIS additions (proposed): `employee.create  employee.update  employee.terminate
employee.import  employee.sensitive_read  salary.read  salary.update
payslip.read  payroll.run  payroll.approve  payroll.mark_paid
leave.approve  leave.reject  leave.adjust_balance  attendance.correct
overtime.approve  reimbursement.approve  document.read  document.upload
document.delete  export.run  privacy.erasure_request  privacy.erasure_done
tenant.purge`.

**Sensitive-read auditing (MUST, D7).** Every read of NIK, NPWP, BPJS numbers,
bank account, salary, payslips, family data or a vault document by someone
other than the data subject writes an audit row (`employee.sensitive_read`,
`salary.read`, `payslip.read`, `document.read`) with `targetType: 'employee'`,
`targetId`, and `metadata.fields` (field names only — **never the values**).
List endpoints return masked values (`maskSecret`-style: `3201••••••••0001`)
and do not audit; the explicit "reveal"/detail endpoint audits. Bulk exports
audit once with row count and filter. A user viewing their own data is not
audited. Because these rows are the proof for UU PDP accountability, sensitive-read
audit rows use a **longer retention** than ordinary rows
(`privacy.sensitiveAuditRetentionDays`, proposed 365) — the purge job keeps them
until then.

**Tenant-visible activity log** (`/app/activity`, `GET /api/app/activity`,
`activity.read` + plan `activityLog`): rows with `tenantId` = this tenant;
platform actions shown only from an allow-list (impersonation start/stop,
suspend, reinstate, plan change) with the actor rendered as "<App> team";
internal metadata keys (`tenantUserId`, `actorId`, `impersonatorId`) stripped.
Window = `min(plan activityLogRetentionDays (−1 → horizon),
privacy.auditRetentionDays)`; the response says when it was clamped.
`GET /api/app/activity/actions` lists the action filter options.

## 3. Crypto helpers — `server/utils/crypto.ts`

```ts
encrypt(plain)            // AES-256-GCM → 'enc:v1:<iv b64url>:<tag b64url>:<ct b64url>'; 12-byte IV
decrypt(value)            // passes non-prefixed values through; '' on failure (rotated key)
isEncrypted(value)
sha256(value)             // hex — token hashes, dedupe keys, API keys
randomToken(bytes = 32)   // hex
safeEqual(a, b)           // timing-safe
maskSecret(value)         // 'abcd••••wxyz' / '••••••••'
// key = scrypt(SETTINGS_SECRET || JWT_SECRET, '<app>.settings.v1', 32); missing → throws
```

Encrypted at rest: SMTP password, gateway server/client keys, any
`isSecret` setting. Rotating `SETTINGS_SECRET` makes old ciphertext unreadable
— re-enter secrets after rotation.

**Sensitive HR fields (D7)** are encrypted with the same helper: NIK, NPWP,
BPJS Kesehatan/Ketenagakerjaan numbers, bank account number, base salary and
salary components, family/dependent data (needed for PTKP status). Rules:

- Column holds the `enc:v1:…` string; the API layer decrypts only inside
  handlers that passed the ability check. Never decrypt in list queries.
- Searching/deduping by NIK or NPWP uses a separate **blind index** column
  (`nikHash = sha256(pepper + normalized value)`), never the ciphertext. Pepper
  is a separate secret from the encryption key.
- Payroll numbers that must be aggregated in SQL (reports) are stored as
  computed totals on the payslip row (also encrypted if per-person) — do not
  require decrypting every row to build a report; reports for non-payroll
  roles never include salary.
- Key rotation for HR data is a **migration job** (decrypt with old key,
  re-encrypt with new, versioned prefix `enc:v2`), not a re-enter-secrets
  flow: losing the key means losing the payroll history. Back the key up
  outside the database (proposed: a dedicated `HR_DATA_KEY`, separate from
  `SETTINGS_SECRET`; the helper takes a key id).
- Never log decrypted values, never put them in error messages, URLs or
  notification bodies; payslip emails link to the ESS, they do not attach data.

## 3b. Retention vs erasure (UU PDP) — proposed policy

The company is the data controller for its employees' data; Nexadream is the
processor (stated in `privacy` and the terms). Erasure requests from an
employee go to the company (HR), who executes them in the console; Nexadream
staff act only on the company's or the owner's instruction.

- **Ex-employees: anonymize, do not hard-delete, while a legal retention duty
  exists.** Payroll, payslip, PPh 21 and BPJS records must be kept for the
  statutory period (tax records: commonly 10 years — confirm with counsel; the
  setting is `privacy.financialRetentionYears`, already published on
  `/api/public/site`). Terminated employees are deactivated (never deleted
  while history points at them, §10).
- **Erasure request flow** (`privacy.erasure_request` → `privacy.erasure_done`
  audit rows): HR opens the request on the employee; the system (a) hard-deletes
  what has no retention duty (documents in the vault, selfies, ESS login,
  contact/family details, profile photo) including storage objects, (b) keeps
  the payroll/tax rows but **anonymizes** identity columns (name →
  "Karyawan terhapus #id", NIK/NPWP/BPJS/bank nulled, blind index removed),
  (c) records the date and the legal basis for what was kept. After the
  retention period a purge job removes the anonymized rows.
- Backups: erased data may persist in backups until
  `privacy.backupRetentionDays`; say so in the policy.
- **Tenant deletion** is soft first (`tenant.delete_request`, grace period),
  then the hard purge cron (`15` §2.4) removes everything including storage;
  a company must be able to **export its data before deletion** (feature
  `export`; offered at the delete step even on Free).
- Data minimization: no sensitive field collected "just in case"; attendance
  GPS coordinates are stored only for the clock-in event, not tracked
  continuously. Selfie/location capture is opt-in per branch and disclosed to
  the employee in the ESS before first use.
- Breach handling and the 3x24h notification duty to the authority and subjects
  are operational procedures (proposed: document in `docs`, not code).

## 4. Rate limiting

In-memory fixed window (`server/utils/rate-limit.ts`; see `03` §8). Scopes in
use: `login:tenant`, `login:tenant:ip`, `login:platform…`, `oauth:start`,
`oauth:callback`, `auth:exchange`, `contact`, `usage-ping` (120/h per user),
plus HRIS (proposed): `clock-in` (per employee, short window to stop
double-taps), `export`, `payslip-download`.
On Vercel serverless this is **per instance and best-effort** (CLAUDE.md):
fine as abuse friction, never as a correctness guarantee. For security-critical
limits (login brute force, exports) back it with a shared store (Redis/Upstash
or a DB counter) — recommended before launch.

## 5. "Last seen"

`touchLastSeen(audience, userId)` is called by the context gatekeepers after
all checks pass. It writes `lastSeenAt` **at most once per 15 minutes per
user** per instance (in-memory map, bounded to 5 000 entries, claim before
write, roll back the claim on failure; on serverless this only reduces
writes, it is not exact — and the write is awaited or `waitUntil`'d). Never awaited, never throws.
`lastLoginAt` moves only on sign-in. Both show in admin user lists; inactivity
reminders read `lastSeenAt ?? lastLoginAt`.

## 6. Product analytics — counters, not people

- Table `usage_daily (dateKey, platform, device, count)` — **device-days, no
  user id, no session id, no history**. ~5 rows/day; no rollup job.
- `POST /api/app/usage/ping` and `POST /api/v1/usage/ping`
  `{ platform: 'web'|'android', device: 'phone'|'tablet'|'desktop',
  lastCountedDate? }`.
- Authenticates on the **session token alone** (no `requireTenantContext` — an
  account still onboarding is a real access). Impersonated sessions are never
  counted.
- The "already counted today" flag lives **on the device** (localStorage /
  app preferences). The device sends the date key it stored; **the server
  compares it against its own clock** (platform timezone) — it never trusts
  the device's date (cheap tablets have wrong clocks). Response
  `{ dateKey, counted }`; the device stores `dateKey`.
- Increment via upsert; on a P2002 race, retry as update.
- `/admin/reports` labels sums as *access-days*, not unique devices.
- The back-office pings nothing.

## 7. Language policy

**Everything a user reads inside the product is in the product language
(here: Bahasa Indonesia). Everything a developer reads is English.**

| Product language | English |
|---|---|
| UI copy, toasts, empty/error states, confirmations | identifiers, comments |
| zod messages (surface directly in forms) | DB tables/columns, enum values, status slugs |
| API error `message` / `statusMessage` | API field names, error `code`s |
| email + notification templates (subjects, bodies, CTAs, footer) | permission keys, menu slugs, routes |
| landing, legal pages, FAQ, `/docs/api` prose | env vars, git commits, every repo doc |
| seeded content (plan names, permission descriptions, menu labels) | |
| payslip labels, leave type names, HR terms (Cuti, Lembur, THR, PPh 21, BPJS, PTKP) via label maps | |
| status labels (via label maps), formatting (`Rp 25.000`, `11 Agustus 2026`) | |

- An English slug never reaches a screen by being rendered directly — every
  enum has a label map and one component renders it.
- Use natural, plain wording (how a small-business owner speaks), consistent
  second person (*Anda*).
- Keep a **closed list** of English labels used on purpose (if any); adding to
  it is a product decision.

## 8. Money

- Platform money (prices, domain amounts): `Decimal(14,2)` in DB, **plain
  number** over the wire; one conversion module:

  ```ts
  toAmount(value: Decimal | number | string | null): number   // → number, 0 for null/NaN
  toDecimal(value: number): Prisma.Decimal                    // rounds to cents
  normalizeRupiah(value: number): number                      // whole rupiah
  ```

- Gateway amounts: `Int` minor units, end to end.
- Never `Float`, never decimal strings in API payloads.
- Server resolves anything price-like (plan price at checkout, domain prices);
  a client-sent amount is never authority.
- **Payroll amounts (HRIS, proposed).** Currency is IDR only. Store as
  `Decimal(14,2)` in DB like the rest, but all payroll results are **whole
  rupiah**: intermediate calculations keep full precision (Prisma
  `Decimal`/integer arithmetic, never `Float`) and are rounded **once per
  line** with `normalizeRupiah` (round half up) at the end of each component
  (gross, each allowance, each deduction, BPJS employee/employer share, PPh 21,
  net), so that the payslip lines always sum exactly to the totals shown.
  PPh 21 by TER, BPJS ceilings/caps and THR proration follow the statutory
  tables, which are **versioned reference data with an effective date** (not
  constants in code); a payslip stores a snapshot of the rates, PTKP status and
  table version used so old payslips never change when rules change.
- Payroll status `draft → approved → paid_recorded`; amounts are frozen at
  `approved`; changes after that create an adjustment in the next period.
  The platform records payment, it never transfers money (D5).
- Salary figures are sensitive (§3): encrypted per person, never in logs or
  notifications, and shown to the employee only on their own payslip.
- Server-side currency formatting for emails replaces the non-breaking space
  `Intl` emits.

## 9. Time

- Store UTC (`timestamp` columns holding UTC). Convert at the edges only.
- Supported zones (Indonesia): `Asia/Jakarta` (WIB), `Asia/Makassar` (WITA),
  `Asia/Jayapura` (WIT) — no DST, fixed offsets. Platform clock = Jakarta.
- `server/utils/timezone.ts`: `zonedDateKey(instant, tz)`,
  `startOfZonedDay(key, tz)`, `zonedDayRange(key, tz)` (half-open),
  `zonedRange(fromKey, toKey, tz)`, `todayKey(tz)`, `addDaysToKey`,
  `addMonthsToKey`, `startOfMonthKey`, `endOfMonthKey`, `isDateKey`.
- **Local-day bucketing happens in SQL** (`prisma.$queryRaw`) and must declare
  the column as UTC before converting:
  `("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE $tz` — a single
  `AT TIME ZONE` on a zone-less column reads UTC as local time and is off by
  hours.
- A multi-branch rollup is cut on the primary branch's clock.
- **Attendance uses the branch (office) timezone, not the company's or the
  user's browser.** Each branch stores its zone (WIB/WITA/WIT). A clock-in is
  stored as a UTC instant stamped by the **server**; the attendance "work date"
  is `zonedDateKey(instant, branch.timezone)` computed at write time and stored
  (`workDate` column) so later timezone edits or moves never reshuffle history.
  An employee moved to another branch keeps old records on their original
  `workDate`. Shifts crossing midnight belong to the work date of the shift
  start. Leave and overtime dates are plain date keys (no time zone), resolved
  against the employee's branch when compared with attendance. Cron jobs
  (`15`) evaluate "today" per branch; cron schedules themselves are UTC on
  Vercel.

## 10. Data integrity rules worth copying

- **Soft delete for tenants; deactivate for members, branches (offices),
  staff, employees (terminate, never delete while payroll/attendance history
  exists — erasure = anonymize, §3b), plans in use, roles in use, menus with
  children.** Anything history points at
  returns 409 with "deactivate instead".
- Snapshot names/prices onto historical rows so editing a catalog never
  rewrites history.
- Denormalized counters are moved only by one function, inside the same
  transaction as the write that justifies them.
- Idempotency keys on anything retried: webhook `dedupeKey`, unique
  `(sourceId, reason)` ledger rows, unique order ids, conditional
  `updateMany` claims for single-use tokens and job rows.
- Transactions wrap "one fact" (payment paid + plan activated; deactivation +
  "please choose" flag). Network calls (email, push, gateway) stay **outside**
  transactions.

## 11. Repository hygiene

- `CHANGELOG.md` entry for every change; `package.json` `version` equals the
  top heading. Heading carries state: `## 1.4.0 (Draft)` while in progress,
  `## 1.4.0 (Released)` once deployed; a Released entry is never edited. Minor
  for features, patch for fixes. Bullets describe the user-visible effect, in
  English.
- `API_CHANGELOG` for `/api/v1` surface changes.
- `CLAUDE.md` (or equivalent) records architecture decisions and the "expensive
  to rediscover" rules; a product doc records product decisions.
- ESLint stylistic (`commaDangle: 'never'`, `braceStyle: '1tbs'`); relax only
  with a reason in the config.
- No test suite is assumed; verification = lint clean + typecheck of changed
  files + exercising the change in the running app. (Adding tests is welcome.)
- Typecheck can be memory-heavy on small servers: scope it to changed files
  with a throwaway tsconfig that extends the generated one and keeps the
  ambient `.d.ts` entries.

## 12. Mobile app (if any — out of scope for now, D6/D9)

The employee self-service web shell (`13` §5b) is mobile-first and covers
clock in/out until a native app exists.

- Talks only to `/api/v1` on the **deployed** server (an endpoint that exists
  only locally doesn't exist for the app). Base URL via build flag, never a
  committed constant.
- Bearer token; refresh via `/auth/refresh`; shows `error.message` verbatim;
  switches on `error.code`; 402 → upgrade sheet; 426 → forced update screen.
- Sends `{{CLIENT_HEADER}}`; reads `/settings/public` before login
  (maintenance, minimum version, registration open).
- Order for a feature the app needs but the API lacks: util → v1 handler →
  docs catalog → changelog → **deploy web** → then the app.
