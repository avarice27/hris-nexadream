# Security review — sensitive data paths (Phase 12)

Scope: D7 / UU PDP data (NIK, NPWP, BPJS numbers, bank account, salary & payslips, family,
employee documents, attendance selfies). Reviewed 2026-10-15 against
`saas-blueprint/18 §2.1` and `12 §12`.

## Storage

| Data | Where | Protection |
|---|---|---|
| NIK, NPWP, BPJS numbers, bank account | `employees.*Encrypted` | AES-256-GCM, key `HR_DATA_KEY` (`server/utils/crypto.ts`, keyId `hr`) |
| Family NIK | `employee_family.nikEncrypted` | same |
| Salary (base + components) | `employee_salaries.dataEncrypted` | same, whole JSON encrypted |
| Payslip lines & per-person amounts | `payslips.dataEncrypted` | same; only run-level aggregates are plain |
| Company NPWP | `tenants.npwp` | same |
| Documents, selfies, leave attachments, receipts | `StoredFile` visibility `private` | signed URL ≤ 5 min, never stored/logged |

## Every decryption site (`grep decryptHr|decrypt(…,'hr')`)

| Site | Gate | Audit / impersonation |
|---|---|---|
| `getEmployee` (masked only) | `employees.read` + scope; masked values only for `employees.sensitive.read` or self | n/a (masked) |
| `revealEmployeeSensitive` | `employees.sensitive.read` | `auditSensitiveRead` (blocks impersonation) |
| `listFamily` | `employees.sensitive.read` | `auditSensitiveRead` |
| `getSalaryHistory` | `payroll.read` + plan `payroll` | `auditSensitiveRead` (salary) |
| `salaryOn`, payroll calculation, run totals | internal to `payroll.write` flows | run-level audit |
| `getPayrollRun` | `payroll.read` | `assertSensitiveReadAllowed` + `salary.read` audit row |
| `getPayslip` (HR) | `payroll.read` + employee scope | `auditSensitiveRead` (payslip); bank/NPWP masked |
| `myPayslip(s)` | self only, visible run statuses | n/a (own data) |
| `exportPayrollRun` | `payroll.read` + plan `export`; bank list also needs `employees.sensitive.read` | `assertSensitiveReadAllowed` + audit |
| `payrollReport` | `payroll.read` (aggregates) | `assertSensitiveReadAllowed` |
| `exportTenantData` | owner `account.manage` | `assertSensitiveReadAllowed` + audit, rate-limited |
| `documentUrl` / `leaveAttachmentUrl` (others) | `documents.read` / `leave.read` + scope | `auditSensitiveRead` (document) — leave attachment added in this review |
| `myEmployeeProfile` | self | masked |
| `tenant-settings` NPWP | `settings.manage` | masked |

## Roles & keys

- `manager` never holds `employees.sensitive.read` or `payroll.*` (unit test `tenant-abilities`
  + smoke test: manager reveal → 403, salary → 403, payroll run → 403).
- `employee` only reaches `/api/app/me/**`, which never accepts an `employeeId`.
- API keys act as owner but `requireTenantAbility` refuses `employees.sensitive.read` /
  `payroll.read` without scope `sensitive` (403 `requiredScope: sensitive`), and refuses
  billing/account/team abilities entirely. Keys cannot manage keys.
- Impersonation: every sensitive read goes through `assertSensitiveReadAllowed`;
  `impersonation.viewSensitive` is held by no role by default.

## Leak channels checked

- Notifications/emails: payslip, leave and request templates carry no amounts or identifiers (D7).
- Audit metadata: field-group names only (e.g. `fieldGroup: 'salary'`), never values;
  salary changes log `componentCount`, not amounts.
- CSV exports: employee export has no sensitive columns; payroll exports gated as above.
- `/api/v1` errors: 5xx messages replaced by a generic message; details only for 4xx.
- Logs: `console.error` prints error objects only (no payloads).

## Residual risks / follow-ups

- `HR_DATA_KEY` falls back to `SETTINGS_SECRET` when unset — `/admin/system` flags it as an error;
  key rotation (re-encrypt job) is not built.
- Attendance selfies are stored but no UI shows them yet (no read path → no leak); a future
  viewer must use `auditSensitiveRead`.
- Rate limits for login/reset/register/contact/invites are now shared (DB); API-key and export
  limits remain per-instance (best-effort).
- PPh 21/BPJS reference values need tax-consultant verification (not a security item, but legal).
