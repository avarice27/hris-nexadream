# HRIS Nexadream — Business Description

Status: **draft, proposed by the AI from the product name and the platform
blueprint**. Confirm or correct, then record changes in `tasks/DECISIONS.md`.

## 1. What it is

A multi-tenant SaaS HRIS for Indonesian companies. A company signs up, gets a
free trial, then pays a recurring subscription (monthly/yearly) sized by number
of employees, branches and enabled modules.

## 2. Personas

| Persona | Account / role | What they do |
|---|---|---|
| Company owner | `TenantUser` + membership `owner` | Signs up, pays the subscription, configures the company, assigns HR admins. |
| HR admin | membership `hr_admin` | Runs day-to-day HR: employees, attendance, leave, payroll. |
| Manager / supervisor | membership `manager` | Approves requests and views the attendance of their team. |
| Employee | membership `employee` (optional login) | Self-service: clock in/out, leave, payslips, profile, requests. |
| Platform staff | `User` + platform `Role` (`/admin`) | Nexadream staff: tenants, plans, payments, content, support. |

## 3. Modules (domain layer, built on the platform layer)

1. **Employee master & organization** — profile, employment history,
   departments, positions, branches, reporting lines, documents.
2. **Attendance** — clock in/out (web/PWA), optional geofence/selfie, shifts,
   corrections with approval, branch-local days.
3. **Leave** — leave types and balances (annual leave per UU Ketenagakerjaan,
   sick, maternity, custom), requests, approval flow, holidays calendar.
4. **Overtime & reimbursement** — requests, approvals, feed into payroll.
5. **Payroll** — salary components, allowances/deductions, PPh 21 (TER
   method), BPJS Kesehatan/Ketenagakerjaan, THR, payroll runs, payslips.
   Records only; no money movement.
6. **Documents** — contracts and employee files in a private vault.
7. **Performance (basic)** — review cycles, goals.
8. **Reports** — headcount, attendance, leave, payroll summaries, export.

## 4. Subscription & money

- Subscription belongs to the company; plans gate employees, branches, team
  seats, storage and modules (see `tasks/DECISIONS.md` D4).
- Company → Nexadream: through the Nexadream Payment Hub (hosted checkout).
- Company → employee salary: **never processed by the platform**.

## 5. Relationships

```
Platform staff ──manage──▶ Tenant (Company) ──has──▶ Subscription ──▶ Plan
Company ──▶ Branch[] ──▶ Employee[] ◀── linked 0..1 ── TenantUser (login)
Company ──▶ Department[] / Position[]
Employee ──▶ Attendance / LeaveRequest / PayrollItem / Document
```

## 6. Compliance notes (Indonesia)

UU PDP for personal data; statutory payroll references (PPh 21 TER, BPJS
rates, UMK) are reference data maintained by platform staff via migrations;
labour-law retention periods override deletion requests for payroll records.
