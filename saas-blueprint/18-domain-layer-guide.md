# 18 — Adding the HRIS Domain

The platform layer (files 01–17) is generic. This file is
how to build HRIS Nexadream's own features (employee, attendance, leave,
payroll ...) **on top of it** without breaking
tenancy, RBAC, plans, the API contract or the UI conventions.

## 1. Recipe for a new domain module

Worked example: a module `leave-requests` (approval-driven; the same shape
applies to `attendance`, `overtime`, `reimbursement`). `tenantId` is always
the Company; `branchId` is the employee's office.

1. **Schema** — new models in `schema.prisma`:
   - `tenantId` on **every** row (plus `branchId` if branch-owned); index
     `tenantId`, FKs, `[tenantId, createdAt]`, and anything filtered/sorted.
   - `@@map` to snake_case; cuid ids; `createdAt`/`updatedAt`.
   - Sensitive columns (NIK, NPWP, BPJS no., bank account, salary, family)
     stored encrypted (`*Encrypted`), never selected by default (see §2.1).
   - Money `Decimal(14,2)`; enums English with label maps added to
     `shared/utils/status.ts`.
   - History-bearing rows: no hard delete path; add `isActive` / `status`
     (`voided`, `archived`) instead.
   - Snapshot names/prices that history must remember.
   - Migration; partial unique indexes by hand in SQL when needed.
2. **Catalog** — `shared/utils/<module>.ts`: enum lists, labels, icons,
   constants shared by server and client.
3. **Abilities** — add only if the existing ones can't express it; extend
   `TenantAbility` and the four role arrays (`owner`, `hr_admin`, `manager`,
   `employee`); update the preset sentences.
   Keep it small — never a per-user matrix.
4. **Plan gates** — if the feature is sold: add a `FEATURE_KEYS` entry and/or
   `LIMIT_KEYS` entry with `FEATURE_META`/`LIMIT_META` labels and conservative
   defaults; set values per plan at `/admin/plans` (and in the seed). Decide
   per rule: refuse (402), clamp, or degrade silently (`06` §5) and record it
   in the gate table.
5. **Server util** — `server/utils/<module>.ts`:

   ```ts
   export const leaveRequestCreateSchema = z.object({ /* product-language messages */ })

   export async function listLeaveRequests(event: H3Event, query: ListQuery) {
     const ctx = await requireTenantAbility(event, 'leave.read')
     // employee: own rows only; manager: own + reports; hr_admin/owner: all (branch-scoped if set)
     const where = { tenantId: ctx.tenantId, ...branchScopeWhere(ctx), ...visibleEmployeesWhere(ctx) }
     const [items, total] = await Promise.all([
       prisma.leaveRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.limit }),
       prisma.leaveRequest.count({ where })
     ])
     return { items: items.map(toView), total }
   }

   export async function createLeaveRequest(event: H3Event, input: z.infer<typeof leaveRequestCreateSchema>) {
     const ctx = await requireTenantAbility(event, 'leave.request')   // role first
     await requireEntitlement(event, 'leaveManagement')                // then plan (if sold)
     const employee = await resolveRequestEmployee(ctx, input.employeeId) // self, or report/any by role
     await requireBranchAccess(event, employee.branchId)               // 404 if out of scope
     // working days, balance and holidays are computed server-side; never trust client totals
     const request = await prisma.$transaction(async (tx) => { /* request + approval steps + balance hold: one fact */ })
     await recordAudit(event, { audience: 'tenant', action: 'leave.request.create', actorId: ctx.user.id,
       actorName: ctx.user.name, tenantId: ctx.tenantId, targetType: 'leave_request', targetId: request.id })
     return toView(request)
   }

   - `toView()` maps DB rows to the wire shape: `Decimal` → number via
     `toAmount`, dates ISO, never internal columns.
6. **Handlers** — `/api/app/<module>/**` and (if the app/integrators need it)
   `/api/v1/<module>/**`, each a few lines over the util. v1: envelope helpers,
   `assertJsonRequest`, docs catalog entry (`enterprise: true` only if it
   really accepts `X-Api-Key`).
7. **Export / import** (optional) — CSV exports behind `export` feature,
   `;`-delimited with UTF-8 BOM so spreadsheet apps open them natively,
   `Content-Disposition: attachment`; imports behind `import` with a
   preview-then-commit flow using the same pass for both.
8. **UI** — page under `/app/<module>`:
   - nav entry in `TENANT_NAV` (with `ability`, and `feature` if paid),
     breadcrumb catalog entry, optional tour entry;
   - `<CommandBar>` with actions; `useServerList` table (server pagination,
     debounced search, filters reset page); `<FormSlideover>` create/edit;
     `useConfirmDialog` for destructive actions; `<StatusBadge>` for enums;
   - `handlePlanError` on every write;
   - reads `activeBranchId` from `useActiveBranch` (no page-level branch
     filter);
   - empty/loading/error states; light + dark; phone/tablet/desktop.
9. **Notifications** — new template keys in `templates.ts` (+ migration
   insert); send via `createNotification`, after commits.
10. **Admin** — if staff need visibility, add a read-only drill-down under the
    tenant detail page, gated by `tenants.read`. Platform reports stay
    aggregate (no per-tenant domain breakdown on platform-wide screens).
11. **Account export** — add the module's tables to `exportTenantData`.
12. **Changelog**, version bump, `API_CHANGELOG` if v1 changed.

## 2. Domain rules (generic patterns + HRIS-specific rules)

The first list came out of the reference implementation and generalises;
the HRIS-specific rules follow in §2.1.

- **Speed is a feature.** The most frequent action in the product must be
  faster than the paper alternative: one request boots the screen, everything
  optional is optional, details can be filled in later.
- **Record, don't destroy.** A financial or historical record is *voided*
  (kept, excluded from totals, reason + actor in the audit log), never
  deleted. Amounts and line items are immutable after saving; corrections are
  void + re-record.
- **Server resolves amounts, taxes and entitlements** (salary, PPh 21, BPJS, leave days). The client may mirror the
  arithmetic for display only. A stale cache must never be able to set an
  amount.
- **Denormalized counters** (totals per customer etc.) are moved by exactly one
  function, inside the same transaction as the write, and reversed on void.
- **Ledgers, not balances that drift.** Anything balance-like is an
  append-only ledger with idempotency keys (`@@unique([sourceId, reason])`),
  plus a denormalized balance moved only alongside a ledger row.
- **Don't invent a balance the user must maintain** (e.g. a cash balance that
  requires recording every deposit); sum a window instead.
- **Big lists are never shipped in a bootstrap payload** — search server-side,
  debounced, after ≥ 2 characters.
- **Local days are cut on the branch clock in SQL** (attendance days,
  leave dates, payroll cut-offs use the employee's branch timezone: WIB/WITA/WIT), with the
  `(col AT TIME ZONE 'UTC') AT TIME ZONE tz` rule.
- **Human-readable codes** for records people read aloud
  (`PREFIX-YYMMDD-NNNN`, unique per tenant, retry on unique violation;
  e.g. leave `CT-260115-0001`, payslip `SL-202601-0042`).
- **Imports write history, not live activity** — they don't trigger side
  effects meant for live actions, they stamp an `importBatchId`, and they run
  in a fixed number of statements (not one round trip per row).
- **Gated reads clamp, gated writes refuse, downgrades keep data.**
- **Out of scope stays out** — keep a written list of deliberately unbuilt
  features in the project's `CLAUDE.md` so they aren't half-built by accident.

### 2.1 HRIS-specific rules (MUST)

- **Sensitive data (D7, UU PDP).** NIK, NPWP, BPJS numbers, bank account
  number, salary and family data are encrypted at rest with the AES-256-GCM
  helper (`16-cross-cutting.md`), **masked in lists** (e.g. `3174********0001`),
  returned in clear only to callers holding an explicit ability
  (`employee.sensitive.read`, `salary.read`), and **every read of salary or
  identity fields is audit-logged** (actor, employee, field group, not the
  value). Never put them in logs, exports without the ability, URLs or
  notification bodies. `manager` never sees salary data; `employee` sees only
  own data.
- **Effective-dated history.** Salary, position, department, branch and
  employment status are effective-dated rows (`effectiveFrom`, optional
  `effectiveTo`), never overwritten in place; "current" = the row effective on a
  date. Payroll for a period reads the values effective in that period.
- **Payroll runs are immutable once approved.** Status `draft -> approved ->
  paid_recorded`. A `draft` may be recalculated; an approved run is never
  edited: **void** it (reason + actor) and **re-run**. Payslips are snapshots
  (names, components, amounts) of the run. The platform records payment status
  only; it never transfers salary (D5).
- **Local days on the branch clock.** Attendance, shifts, leave dates and
  cut-offs are local calendar days of the employee's branch, cut in SQL with
  `(col AT TIME ZONE 'UTC') AT TIME ZONE tz`. Late/overtime are computed
  against the shift in that clock.
- **Approval flows.** Leave, overtime, reimbursement and attendance
  corrections share one approval mechanism: request -> step(s) -> approved /
  rejected / cancelled. Default step = the employee's direct manager, then
  optionally `hr_admin`; custom chains sit behind `customApprovalFlows`.
  Approvers cannot approve their own requests. Each decision is audit-logged
  and notifies the requester after commit.
- **Balances are ledgers** (leave balance, reimbursement budget): append-only
  rows with idempotency keys, balance moved only with a ledger row; void
  reverses.
- **Retention and erasure (UU PDP).** Respect `reportRetentionDays`; ex-employee
  data is anonymised/purged by a scheduled job, but statutory payroll records
  are retained as the law requires. Account export includes the employee
  tables, subject to the sensitive-data ability rules.

### 2.2 Out of scope (D6) — keep out, do not half-build

Recruitment / ATS, learning management, e-signature, bank disbursement
(salary transfer), tax filing (e-Bupot / SPT), biometric hardware integration,
native mobile app. Keep this list in the project `CLAUDE.md`.

## 3. What must not change when adding domain code

- The gatekeepers, envelope, error codes, and entitlement module APIs.
- The subscription state machine and payment path.
- Published `/api/v1` fields.
- The language policy and label-map pattern.
- The rule that the web console and the app share one util per capability.
