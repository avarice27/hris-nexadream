# 15 — Scheduled Jobs (Cron)

## 1. Design: open URLs, throttled, idempotent

Cron endpoints live under `/api/cron/**`, answer **any HTTP method** (Vercel
Cron sends plain `GET`), and take **no credentials** — deliberately. The
schedulers small deployments actually have (Vercel Cron, a hosting cron panel,
an uptime pinger) can only fetch a URL; a job that needs a header is a job that
silently never runs. Schedules are declared in the web app's `vercel.json` (§3).

What an anonymous caller can trigger is only work that was already due, so the
guard is a **throttle, not a secret**:

- at most **one real run per job per minute**, per function instance
  (best-effort only — on Vercel serverless instances do not share memory, so
  correctness MUST come from idempotency and durable claims in the DB, never
  from this throttle);
- a call inside that window (or while a run is in progress) gets the last
  summary back with `skipped: true`;
- **every step is idempotent**, so a double run changes nothing.

```ts
// server/utils/cron.ts
const RUN_INTERVAL_MS = 60_000
export async function runThrottled(job: string, run: () => Promise<Record<string, unknown>>) {
  const jobs = (globalThis.__cronJobs ??= new Map<string, { ranAt: number, summary?: object }>())
  const last = jobs.get(job)
  if (last && Date.now() - last.ranAt < RUN_INTERVAL_MS) return { ...(last.summary ?? { running: true }), skipped: true }
  const state = { ranAt: Date.now() }      // claimed BEFORE the work
  jobs.set(job, state)
  const summary = { success: true, ranAt: new Date(state.ranAt).toISOString(), ...(await run()) }
  state.summary = summary
  return summary
}
```

Jobs that must run **once per local day** across restarts additionally claim
the day durably with `claimSettingValue('cron.<job>RanOn', todayKey)` (a
conditional DB update — this is what actually prevents double runs on Vercel).
The handler must finish within the function's `maxDuration`: process in bounded
batches and resume on the next invocation (every job below is written so
unfinished work is simply picked up next time). Work after the response is
never relied on; await it or use `waitUntil`.

Each step is wrapped in its own try/catch (per item where it loops) so one
failure never stops the rest; errors are logged.

## 2. Jobs

### 2.1 `/api/cron/subscriptions` — daily (e.g. 00:05 platform time)

Steps, in order:

1. **Trials expired** — `status=trialing, trialEndsAt <= now` →
   `transitionSubscription('trial_expired', force)` (→ free +
   `enforceBranchLimit`).
2. **Grace expired** — `status=past_due, graceEndsAt <= now` →
   `grace_expired`.
3. **Cancellations ended** — `status=cancelled, currentPeriodEnd <= now` →
   `grace_expired` (same downgrade path).
4. **Trial reminders** — `trialing` with `trialEndsAt` within
   `billing.trialReminderDays` → `trial_ending_soon` notification to the owner,
   **at most once per UTC day per tenant** (skip if one with that template key
   exists since start of day).
5. **Payment reconciliation** — `reconcilePendingPayments()` (pending payments
   of the active gateway from the last 48 h, re-read from the gateway). Runs
   last so a slow gateway cannot delay the steps above.
6. **Audit purge** — `purgeExpiredAudits({ force: true })` in batches of 5 000
   until a batch comes back short (max 20 passes).

Returns `{ success, ranAt, trialsExpired, gracesExpired, cancellationsClosed,
remindersSent, paymentsChecked, paymentsUpdated, auditRowsPurged }`.

### 2.2 `/api/cron/scheduled-notifications` — hourly (or at each broadcast slot)

`sendDueScheduledNotifications()` — see `11-notifications-and-email.md` §6.
Returns `{ due, sent, failed, missed, interrupted }`.

### 2.3 `/api/cron/inactivity` — daily at the run hour (e.g. 07:00 platform time)

`runInactivityReminders()` — see `11` §7. No-op before the run hour; once per
local day via `claimSettingValue`.

### 2.4 HRIS domain jobs (all PROPOSED — confirm before building)

Each is a new endpoint wrapped in `runThrottled('<name>', …)`, idempotent per
step, and computes "today" **per branch timezone** (`16` §9), never the server
clock. Vercel Cron fires in UTC, so schedules below are UTC; WIB = UTC+7.
To keep the number of cron entries low (see §4 caveat) the daily HR work is
grouped into **one** endpoint with ordered steps, like `subscriptions`.

| Endpoint | Schedule (UTC) | Steps |
|---|---|---|
| `/api/cron/hr-daily` | `0 17 * * *` (00:00 WIB) | 1. **Leave accrual**: for each active employee, grant the entitlement due today (annual leave after the 12-month service anniversary per UU Ketenagakerjaan, or the company's accrual rule). Idempotent via unique ledger row `(employeeId, leaveTypeId, reason, periodKey)`. 2. **Leave expiry**: expire carried-over balances past their deadline, writing a negative ledger row with a unique `(balanceId, 'expiry')` key. 3. **Contract/probation expiry reminders**: employees whose contract or probation ends within `hr.contractReminderDays` (default 30 and 7) → notification to `hr_admin` + manager, at most once per milestone per employee (unique key `(employeeId, endDate, milestone)`). Also marks contracts past `endDate` as `expired` (status flag only, never auto-terminates). 4. **Birthday / work anniversary**: notify the employee's manager and HR (opt-out in settings), once per employee per year. |
| `/api/cron/attendance-close` | `0 */2 * * *` (hourly-ish; the job itself works per branch) | For each branch whose local day just ended (past the shift end + `attendance.autoCloseGraceHours`), close open records that have a clock-in but no clock-out: set status `missing_clock_out`, notify the employee and manager so a correction request can be filed. **Never invents a clock-out time or pays on it.** Idempotent: only rows still `open` are touched (conditional `updateMany`). |
| `/api/cron/payroll-reminders` | `0 1 * * *` (08:00 WIB) | Remind `hr_admin`/owner when a payroll period cutoff is `hr.payrollReminderDays` away (default 3) and no run exists; remind on the pay date if a run is `approved` but not `paid_recorded`. At most once per period per milestone (notification dedupe key). Reminders only — the platform never moves salary (D5). |
| `/api/cron/purge-deleted-tenants` | `30 19 * * 0` (weekly, Mon 02:30 WIB) | Hard-purge tenants soft-deleted longer than `privacy.tenantRetentionDays` (default 30): delete their storage objects (document vault, payslip PDFs) first, then rows in dependency order, in bounded batches resumable on the next run. Records a `tenant.purge` audit row with no personal data. Must respect retention exceptions in `16` §3b. |

Other candidates (not scheduled by default): personal-data retention purge
(`privacy.retentionMonths`) for ex-employee records past the legal retention
period; expiring document reminders (work permit, certification).

## 3. Scheduling — `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/subscriptions",           "schedule": "5 17 * * *" },
    { "path": "/api/cron/scheduled-notifications", "schedule": "0 * * * *" },
    { "path": "/api/cron/inactivity",              "schedule": "0 0 * * *" },
    { "path": "/api/cron/hr-daily",                "schedule": "0 17 * * *" },
    { "path": "/api/cron/attendance-close",        "schedule": "0 */2 * * *" },
    { "path": "/api/cron/payroll-reminders",       "schedule": "0 1 * * *" },
    { "path": "/api/cron/purge-deleted-tenants",   "schedule": "30 19 * * 0" }
  ]
}
```

(Vercel Cron runs in **UTC**; the jobs compute local days themselves per
branch/platform timezone. `inactivity` fires at 00:00 UTC = 07:00 WIB; the job
still waits for its run hour and claims the day.) Outside Vercel the same URLs
can be hit by any scheduler, e.g. `curl -fsS {{SITE_URL}}/api/cron/subscriptions`.

## 4. Vercel Cron caveats and multi-instance rule

- **Plan limits (verify against current Vercel pricing before relying on
  this):** historically the Hobby plan allows only a small number of cron jobs
  (about 2) and only **once-per-day** schedules with imprecise timing, while
  Pro allows more jobs and per-minute schedules. The list above (7 entries,
  one hourly and one 2-hourly) needs **Pro**. On a restricted plan, merge jobs
  into one daily dispatcher endpoint or drive hourly jobs from an external
  pinger.
- Vercel may deliver an invocation **more than once or slightly late**:
  another reason every step is idempotent and uses durable claims.
- Cron invocations are subject to function `maxDuration`; keep batches small.
- The throttle and several caches are per-instance by design. Do not move
  correctness onto them; DB claims and unique keys are the guarantee. A shared
  store (Redis / DB advisory lock) only tightens the throttle and is optional.
