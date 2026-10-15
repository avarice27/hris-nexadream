# 11 — Notifications, Email & Push

## 1. Architecture

```
createNotification(params, tx?)                 server/utils/notifications.ts
  ├─ resolve template (DB row if active, else code catalog) and render {{tokens}}
  ├─ write the in-app row (Notification)  ← inside the caller's transaction when tx given
  └─ dispatchExternal(ctx, channels)      server/services/notifications/dispatch.ts
        ├─ emailChannel   (enabled when smtp.host is set)
        └─ pushChannel    (enabled when FIREBASE_SERVICE_ACCOUNT is set; tenant audience only)

sendTemplatedEmail(key, to, vars)              server/utils/email.ts — direct email, no bell row
pushToUser / sendDirectPush / sendToTopic      push without a bell row
```

- **A channel failure never bubbles into the business operation** that caused
  it — every channel is wrapped in try/catch and logged.
- **Push never holds the request**: the push channel hands its sends to
  `event.waitUntil()` and returns at once.
- Adding a channel (e.g. WhatsApp) = one file implementing
  `NotificationChannel` + one entry in `EXTERNAL_CHANNELS`.

```ts
export interface NotificationChannel {
  readonly name: string                       // 'email' | 'push' | …
  isEnabled(): Promise<boolean> | boolean     // cheap; unconfigured = silent
  deliver(ctx: NotificationContext): Promise<void>
}
export type ChannelOverrides = Partial<Record<'database' | 'email' | 'push', boolean>>
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'
```

## 2. `createNotification`

```ts
createNotification({
  audience: 'tenant' | 'platform',
  userId?,            // platform recipient
  tenantUserId?,      // tenant recipient
  tenantId?,
  // either explicit copy…
  title?, body?, actionUrl?, actionLabel?, icon?, level?,
  // …or a template
  templateKey?, variables?,
  channels?: { database?: false, email?: false, push?: false }
}, tx?)
```

- Explicit fields override template fields.
- No title and no known template → throws (programming error).
- `channels.database === false` skips the bell row (used for push-only sends).
- Recipient email/name are looked up from `userId` / `tenantUserId` for the
  email channel.

`notifyPlatform(permissionKey, params)` — sends to **every active staff member
whose role holds that permission** (e.g. `tenants.read` for "new business",
`messages.read` for "new contact message", `tenants.write` for "deletion
request").

`listNotifications(event, { search, unreadOnly, dateFrom, dateTo, page, limit })`
— one implementation behind the tenant bell, the `/app/notifications` page and
`GET /api/v1/notifications`. `unreadCount` counts **everything addressed to
the user**, never just the filtered page. Scope: `audience='tenant'`,
`tenantUserId`, `tenantId`.

Endpoints (each audience):

```
GET  /api/app/notifications            ?search&unreadOnly&dateFrom&dateTo&page&limit
POST /api/app/notifications/:id/read
POST /api/app/notifications/read-all
GET  /api/admin/notifications          (+ same read endpoints)
GET  /api/v1/notifications             (+ same read endpoints)
```

The client `useNotifications()` is a `useState` composable shared by the bell
dropdown and the notifications page (one fetch, one badge).

## 3. Templates

Two tables, seeded from one code catalog (`shared/utils/templates.ts`):
`EMAIL_TEMPLATES` and `NOTIFICATION_TEMPLATES`. Keys are English; every
rendered string is in the product language. Admin edits copy at
`/admin/email-templates` and `/admin/notification-templates`; keys are not
created in the UI (they're referenced by code).

```ts
export type TemplateVariable = { token: string, label: string, sample: string }  // type alias (Prisma Json)

export interface EmailTemplateDef {
  key: string; name: string; description: string
  subject: string; body: string            // inner HTML only; brand wrapper added at send time
  variables: TemplateVariable[]
}
export interface NotificationTemplateDef {
  key: string; name: string; title: string; body: string
  actionLabel?: string; actionUrl?: string; icon?: string
  level: 'info' | 'success' | 'warning' | 'error'
  variables: TemplateVariable[]
}

/** {{token}} → value (unknown/null → ''). Optional block {{#name}}…{{/name}} renders only when name is non-empty. */
export function renderTemplateString(template, variables): string
```

Common variables injected into every email: `appName` (= `company.name`),
`siteUrl`, `supportEmail` (= `company.email`).

Resolution rules (they differ on purpose):

| | DB row active | DB row inactive | No DB row |
|---|---|---|---|
| Email (`renderEmailTemplate`) | DB row | **not sent** (admin switched it off) | code catalog |
| Notification (`resolveTemplate`) | DB row | code catalog | code catalog |

The email channel, when mirroring a notification that has a `templateKey`,
prefers the **email template with the same key** (richer copy); otherwise it
sends the notification title/body with a CTA button to `actionUrl`.

### 3.0 HRIS content rule (MUST — D7)

Email, bell and push copy **never contains sensitive values**: no salary or
allowance amounts, NIK, NPWP, BPJS/bank numbers, no leave medical reasons, no
payslip PDF attached. Notify *that* something is ready and link to the
authenticated page (`/app/payslips/:id`); the amount is shown only after
login. Push bodies are visible on lock screens, so they stay generic. A
`payslip_published` mail goes to the employee's login email only when the
employee has a login (an Employee record may exist without one, D2) and the
company has `payroll`.

### 3.1 Template catalog

Generic platform email templates:

| Key | When | Variables |
|---|---|---|
| `welcome` | after signup | `name`, `tenantName`, `loginUrl` |
| `verify_phone_or_email` | reserved for OTP verification | `name`, `code`, `expiresInMinutes` |
| `tenant_invitation` | owner/hr_admin invites a team member (`hr_admin`, `manager`) | `name`, `inviterName`, `tenantName`, `roleName`, `inviteUrl`, `expiresAt` |
| `password_reset` | forgot password (both audiences) | `name`, `resetUrl`, `expiresInHours` |
| `user_invitation` | staff invite | `name`, `inviterName`, `roleName`, `inviteUrl`, `expiresAt` |
| `trial_started` | trial granted | `planName`, `trialEndsAt` |
| `trial_ending_soon` | cron reminder | `daysLeft`, `planName`, `tenantName`, `trialEndsAt`, `billingUrl` |
| `payment_success` | payment paid | `amount`, `planName`, `periodLabel`, `orderId`, `periodEnd`, `tenantName`, `billingUrl` |
| `payment_failed` | failed/expired while due | `amount`, `planName`, `tenantName`, `graceEndsAt`, `billingUrl` |
| `subscription_downgraded` | downgrade enforced | `branchSelectionUrl` |
| `tenant_deleted` | soft delete | `tenantName`, `deletedAt` |
| `contact_enquiry` | contact form → company inbox | `name`, `email`, `phone`, `subject`, `message` |
| `inactivity_winback` | owner inactive N days | `name`, `tenantName`, `days`, `appUrl` |

HRIS email templates (domain; key → variables; mail goes to a login's email):

| Key | When | Variables |
|---|---|---|
| `employee_invitation` | hr_admin invites an Employee record to self-service (creates `employee` login) | `name`, `tenantName`, `inviterName`, `inviteUrl`, `expiresAt` |
| `leave_requested` | employee submits leave → the approver (manager, else hr_admin) | `approverName`, `employeeName`, `leaveTypeName`, `startDate`, `endDate`, `days`, `reviewUrl` |
| `leave_approved` | request approved → employee | `name`, `leaveTypeName`, `startDate`, `endDate`, `approverName`, `detailUrl` |
| `leave_rejected` | request rejected → employee | `name`, `leaveTypeName`, `startDate`, `endDate`, `approverName`, `{{#reason}}`, `detailUrl` |
| `payslip_published` | payroll period `paid_recorded` and payslips released → employee | `name`, `periodLabel`, `payslipUrl` (no amounts) |
| `attendance_missing` | cron: no clock-out/clock-in on a workday → employee | `name`, `date`, `attendanceUrl` |
| `contract_expiring` | cron: contract ends in N days → hr_admin (digest) | `name`, `tenantName`, `count`, `days`, `contractsUrl` |
| `overtime_requested` / `reimbursement_requested` | → approver | `approverName`, `employeeName`, `requestUrl` |
| `request_decided` | overtime/reimbursement approved/rejected → employee | `name`, `requestTypeLabel`, `decisionLabel`, `detailUrl` |
| `employee_limit_reached` | active employees hit the plan cap (`LIMIT_REACHED`) → owner | `name`, `tenantName`, `max`, `billingUrl` |

Indonesian sample copy (inner HTML only, brand wrapper added at send):

- `employee_invitation` — subject: "{{inviterName}} mengundang Anda ke {{tenantName}} di {{appName}}"; body: "Halo {{name}}, {{tenantName}} mengundang Anda mengakses absensi, cuti, dan slip gaji Anda lewat {{appName}}. Aktifkan akun sebelum {{expiresAt}}: [Aktifkan akun]({{inviteUrl}})."
- `leave_requested` — subject: "Pengajuan cuti dari {{employeeName}}"; body: "{{employeeName}} mengajukan {{leaveTypeName}} selama {{days}} hari ({{startDate}} – {{endDate}}). [Tinjau pengajuan]({{reviewUrl}})."
- `leave_approved` — subject: "Cuti Anda disetujui"; body: "Pengajuan {{leaveTypeName}} Anda ({{startDate}} – {{endDate}}) disetujui oleh {{approverName}}."
- `leave_rejected` — subject: "Cuti Anda ditolak"; body: "Pengajuan {{leaveTypeName}} Anda ({{startDate}} – {{endDate}}) ditolak oleh {{approverName}}.{{#reason}} Alasan: {{reason}}{{/reason}}"
- `payslip_published` — subject: "Slip gaji {{periodLabel}} sudah tersedia"; body: "Halo {{name}}, slip gaji periode {{periodLabel}} sudah dapat dilihat. Masuk untuk membukanya: [Lihat slip gaji]({{payslipUrl}})."
- `attendance_missing` — subject: "Absensi {{date}} belum lengkap"; body: "Halo {{name}}, kami belum menemukan catatan absen Anda pada {{date}}. Jika ini keliru, ajukan koreksi absensi: [Buka absensi]({{attendanceUrl}})."
- `contract_expiring` — subject: "{{count}} kontrak karyawan berakhir dalam {{days}} hari"; body: "Halo {{name}}, ada {{count}} kontrak di {{tenantName}} yang segera berakhir. [Lihat daftar kontrak]({{contractsUrl}})."

Notification templates (bell + push):

| Key | Title (example) | Action | Level |
|---|---|---|---|
| `welcome` | "Selamat datang di {{appName}}" | `/app/dashboard` | success |
| `trial_started` | "Uji coba {{planName}} aktif" | `/app/billing` | info |
| `trial_ending_soon` | "Uji coba berakhir {{daysLeft}} hari lagi" | `/app/billing` | warning |
| `payment_success` | "Pembayaran diterima" | `/app/billing` | success |
| `payment_failed` | "Pembayaran gagal" — "Selesaikan sebelum {{graceEndsAt}}…" | `/app/billing` | error |
| `subscription_downgraded` | "Akun turun ke paket Free" | `/app/branches` | warning |
| `leave_requested` | "Pengajuan cuti dari {{employeeName}}" (approver) | `/app/approvals` | info |
| `leave_approved` | "Cuti Anda disetujui" (employee) | `/app/leave` | success |
| `leave_rejected` | "Cuti Anda ditolak" (employee) | `/app/leave` | warning |
| `payslip_published` | "Slip gaji {{periodLabel}} tersedia" — no amount (employee) | `/app/payslips` | info |
| `attendance_missing` | "Absensi {{date}} belum lengkap" — push + bell (employee) | `/app/attendance` | warning |
| `contract_expiring` | "{{count}} kontrak segera berakhir" (hr_admin) | `/app/employees?contract=expiring` | warning |
| `employee_limit_reached` | "Batas karyawan paket {{planName}} tercapai" (owner) | `/app/billing` | warning |
| `team_invite_accepted` | "{{memberName}} bergabung ke tim" | `/app/team` | success |
| `inactivity_nudge` | push only (no bell row) | `/app/dashboard` | info |
| `tenant_suspended` | "Akun ditangguhkan" | `/contact` | error |
| `tenant_deleted` | "Akun perusahaan dihapus" | `/contact` | error |
| `admin_new_tenant` | "Perusahaan baru: {{tenantName}}" (staff) | `/admin/tenants` | info |
| `admin_new_message` | "Pesan baru dari {{name}}" (staff) | `/admin/messages` | info |

A template whose copy builds on a variable (e.g. `{{graceEndsAt}}`) must only
be sent when that variable has a value — sending `payment_failed` with an
empty deadline to a paid-up customer is a real past bug.

## 4. Email — `server/utils/email.ts`

- **The only module that knows an SMTP library exists.** SMTP credentials come
  from settings (`smtp.*`), never env.
- `smtp.host` empty → every send is a **silent no-op** returning
  `{ sent: false, skipped: 'not-configured' }` (normal in dev; must never
  throw).
- Transporter cached on `globalThis`, keyed by the serialized SMTP config, so
  a settings change rebuilds it.
- `from` = `"<smtp.fromName>" <smtp.fromEmail>`.
- Every HTML body is wrapped by `wrapEmailHtml(inner, { appName, siteUrl,
  supportEmail, companyName, logoUrl })` (`shared/utils/email-brand.ts`):
  table layout, logo (`company.logoUrl` or a bundled default, absolute URL),
  brand-coloured CTA class, footer with company name, support email, year.
  It also **absolutizes root-relative hrefs** (`href="/app/…"` →
  `{{SITE_URL}}/app/…`) because mail clients have no base URL; `//host`,
  `mailto:`, `#` and absolute links are left alone.
- A plain-text alternative is generated (`htmlToText`).
- Send failures are logged and returned (`{ sent: false, error }`), never
  thrown — email must never break the request that triggered it.
- Seam: delivery is inline; a queue can be inserted behind `sendEmail` without
  touching callers.

```ts
sendEmail({ to, subject, html, text?, replyTo?, attachments?, raw? }): Promise<SendEmailResult>
renderEmailTemplate(key, variables): Promise<{ subject, html } | null>
sendTemplatedEmail(key, to, variables): Promise<SendEmailResult>
isEmailConfigured(): Promise<boolean>
```

Admin: test email (`POST /api/admin/settings/test-email`), template editor
with live preview (`POST /api/admin/email-templates/preview { subject, body,
variables }` → rendered subject + wrapped HTML).

## 5. Push — FCM (optional)

- `server/services/notifications/fcm.ts` is the **only file that knows FCM**:
  HTTP v1 API, OAuth access token minted with `jsonwebtoken` from the service
  account (`FIREBASE_SERVICE_ACCOUNT`, base64 JSON). No `firebase-admin`.
  Exports `isFcmConfigured()`, `sendToToken(token, msg) → 'sent' |
  'invalid_token' | 'failed'`, `sendToTopic(topic, msg)`,
  `subscribeToTopic(tokens, topic)`.
- **Devices are rows** (`PushDevice`), upserted on the token; re-registering
  moves the device to whoever signed in last and refreshes `lastSeenAt`. On
  first registration the server subscribes the token to topic `all` (browsers
  can't subscribe themselves).
- `POST /api/app/devices { token, platform: 'android'|'web', appVersion? }`
  (+ v1) — requires a tenant session; stores `tenantId` of the session.
- `POST /api/app/devices/unregister { token }` (+ v1) — **no session
  required**: holding the FCM token is the proof, and deleting it can only stop
  pushes to that device. Called on sign-out (before revoking the session) and
  on a 401.
- Push channel delivers **tenant audience only** to the recipient's devices
  whose `tenantId` matches the notification's tenant (or is null); tokens FCM
  reports invalid are deleted.
- Web push in `/app` is **opt-in by a tap** (settings modal from the bell);
  the service worker draws the notification without loading the Firebase SDK.
  A click on any push opens `/app/notifications`. Impersonated sessions never
  register a device.
- `/admin` receives no push.
- Superadmin test: `/admin/tenant-users` → "send push" → `sendDirectPush()`
  (waits for FCM, returns per-device outcome, writes no bell row).

## 6. Scheduled broadcasts — `/admin/scheduled-notifications`

- Model `ScheduledNotification { title, body, scheduledFor, status, sentAt,
  error, createdById }`.
- `scheduledFor` = a **platform-timezone date + one fixed slot**
  (`SCHEDULED_NOTIFICATION_SLOTS = [8, 10, 13, 16]`, WIB) — a fixed list so the
  cron only needs to run at those hours and nobody is pushed at night.
- Sent as **one** `sendToTopic('all', …)` — no bell rows, no email.
- Cron `/api/cron/scheduled-notifications` (hourly or at least at each slot):
  1. rows still `scheduled` from an earlier day → `failed` ("missed");
  2. rows stuck in `sending` for more than 10 minutes → `failed` with a note, **never
     resent** (FCM may have accepted it);
  3. due rows today (`scheduledFor <= now`): **claim** each with a conditional
     update `scheduled → sending` (overlapping runs can't double-send), send,
     mark `sent` (+`sentAt`) or `failed` (+ localized reason).
- Sent rows are history: no edit, no delete. Editing a failed row reschedules
  it.

## 6.1 HR reminder crons (HRIS — proposed)

Plain public `GET /api/cron/*`, throttled and idempotent (Vercel Cron):

- `/api/cron/attendance-reminders` — after each branch's shift end (**branch
  timezone**, WIB/WITA/WIT), employees with a login and a scheduled workday
  but no complete clock record get `attendance_missing` (push + bell). One
  per employee per date; guarded by a unique key `(employeeId, date,
  'attendance_missing')` in the notification row or `claimSettingValue` per
  branch-day, so overlapping runs never double-send. Skips approved leave,
  holidays (`ref_public_holidays`) and companies without the attendance feature.
- `/api/cron/contract-expiry` — daily; `contract_expiring` digest to each
  company's `hr_admin`s at 60/30/7 days, one digest per company per day.
- Scheduled broadcasts (§6) remain platform-to-all marketing/ops notices and
  must not carry company data.

## 7. Inactivity reminders (engagement)

`/api/cron/inactivity`, hit daily (e.g. 07:00 platform time):

- Owners (only owners, of active tenants) whose last activity
  (`lastSeenAt`, else `lastLoginAt`) fell on the local day exactly
  `INACTIVITY_PUSH_DAYS = 3` ago → push `inactivity_nudge` via `pushToUser()`
  (no bell row); exactly `INACTIVITY_EMAIL_DAYS = 10` ago → email
  `inactivity_winback`.
- **Stateless per person**: nothing records who was reminded (a missed day is
  simply missed). To avoid repeats, the job does nothing before the run hour
  and runs **once per local day**, claimed durably with
  `claimSettingValue('cron.inactivityRanOn', todayKey)`.
