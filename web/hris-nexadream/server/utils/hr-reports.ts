import type { H3Event } from 'h3'
import { z } from 'zod'
import { EMPLOYMENT_TYPE_LABELS } from '#shared/utils/hr'
import { EMPLOYMENT_STATUS_META } from '#shared/utils/status'
import { addDaysToKey, dateKeyToDb, dateKeysBetween, dbDateToKey, todayKey } from '#shared/utils/timezone'
import { toCsv } from '#shared/utils/csv'
import { UNLIMITED } from '#shared/utils/plans'

// 11.10 Laporan HR + ekspor CSV, dan ringkasan dashboard. Laporan menghormati reportRetentionDays
// (rentang dijepit, bukan ditolak — "gated reads clamp").

async function clampFrom(tenantId: string, fromKey: string, today: string): Promise<{ from: string, clamped: boolean }> {
  const days = await limit(tenantId, 'reportRetentionDays')
  if (days === UNLIMITED) return { from: fromKey, clamped: false }
  const earliest = addDaysToKey(today, -days)
  return fromKey < earliest ? { from: earliest, clamped: true } : { from: fromKey, clamped: false }
}

export const reportRangeSchema = z.object({ from: dateKeySchema, to: dateKeySchema, branchId: z.string().optional(), format: z.enum(['json', 'csv']).optional() })

export async function headcountReport(event: H3Event, query: z.infer<typeof reportRangeSchema>) {
  const ctx = await requireTenantAbility(event, 'reports.read')
  const scope = await visibleEmployeesWhere(event, ctx)
  const where = { AND: [scope, query.branchId ? { branchId: query.branchId } : {}] }
  const today = todayKey(ctx.tenant.timezone)
  const { from, clamped } = await clampFrom(ctx.tenantId, query.from, today)
  // Dua gelombang (<= 4 query paralel) agar pool koneksi tidak habis.
  const current = { AND: [where, { status: { in: ['active', 'probation', 'on_leave'] as Array<'active'> } }] }
  const [byStatus, byType, byBranch, byDepartment] = await Promise.all([
    prisma.employee.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ['employmentType'], where: current, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ['branchId'], where: current, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ['departmentId'], where: current, _count: { _all: true } })
  ])
  const [joiners, leavers, branches, departments] = await Promise.all([
    prisma.employee.count({ where: { AND: [where, { joinDate: { gte: dateKeyToDb(from), lte: dateKeyToDb(query.to) } }] } }),
    prisma.employee.count({ where: { AND: [where, { endDate: { gte: dateKeyToDb(from), lte: dateKeyToDb(query.to) } }] } }),
    prisma.branch.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true } })
  ])
  const active = byStatus.filter(s => ['active', 'probation', 'on_leave'].includes(s.status)).reduce((sum, s) => sum + s._count._all, 0)
  const bName = new Map(branches.map(b => [b.id, b.name]))
  const dName = new Map(departments.map(d => [d.id, d.name]))
  return {
    from, to: query.to, clamped,
    active, joiners, leavers,
    // Turnover = keluar / rata-rata (aktif sekarang + keluar) — perkiraan sederhana.
    turnoverPercent: active + leavers ? Math.round((leavers / ((active + active + leavers - joiners) / 2 || 1)) * 1000) / 10 : 0,
    byStatus: byStatus.map(s => ({ key: s.status, label: EMPLOYMENT_STATUS_META[s.status]?.label ?? s.status, count: s._count._all })),
    byType: byType.map(s => ({ key: s.employmentType, label: EMPLOYMENT_TYPE_LABELS[s.employmentType], count: s._count._all })),
    byBranch: byBranch.map(s => ({ key: s.branchId, label: bName.get(s.branchId) ?? '-', count: s._count._all })).sort((a, b) => b.count - a.count),
    byDepartment: byDepartment.map(s => ({ key: s.departmentId ?? 'none', label: s.departmentId ? dName.get(s.departmentId) ?? '-' : 'Tanpa departemen', count: s._count._all })).sort((a, b) => b.count - a.count)
  }
}

export async function attendanceReport(event: H3Event, query: z.infer<typeof reportRangeSchema>) {
  const ctx = await requireTenantAbility(event, 'reports.read')
  const today = todayKey(ctx.tenant.timezone)
  const { from, clamped } = await clampFrom(ctx.tenantId, query.from, today)
  const to = query.to > today ? today : query.to
  if (to < from) return { from, to, clamped, items: [] }
  if (dateKeysBetween(from, to).length > 62) throw httpError(400, 'VALIDATION_FAILED', 'Rentang laporan absensi maksimal 62 hari.')
  const employees = await prisma.employee.findMany({
    where: { AND: [await visibleEmployeesWhere(event, ctx), { status: { in: ['active', 'probation', 'on_leave'] } }, query.branchId ? { branchId: query.branchId } : {}] },
    orderBy: { fullName: 'asc' }, take: 1000,
    include: { branch: { select: { name: true, timezone: true } }, department: { select: { name: true } } }
  })
  const ids = employees.map(e => e.id)
  const resolve = await buildScheduleResolver(ctx.tenantId, employees, from, to)
  const [records, leaves] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { tenantId: ctx.tenantId, employeeId: { in: ids }, workDate: { gte: dateKeyToDb(from), lte: dateKeyToDb(to) } } }),
    approvedLeaveDays(ctx.tenantId, ids, from, to)
  ])
  const byKey = new Map(records.map(r => [`${r.employeeId}:${dbDateToKey(r.workDate)}`, r]))
  const now = new Date()
  const items = employees.map((e) => {
    const joinKey = dbDateToKey(e.joinDate)
    const days = dateKeysBetween(from > joinKey ? from : joinKey, to).map((k) => {
      const schedule = resolve(e, k)
      const record = byKey.get(`${e.id}:${k}`)
      return { schedule, record: record ? { lateMinutes: record.lateMinutes, workedMinutes: record.workedMinutes } : null, status: dayStatus(schedule, record, leaves.get(e.id)?.get(k) ?? null, k, todayKey(e.branch.timezone), now, e.branch.timezone) }
    })
    return { employeeId: e.id, employeeNumber: e.employeeNumber, fullName: e.fullName, branchName: e.branch.name, departmentName: e.department?.name ?? null, ...summarizeDays(days) }
  })
  return { from, to, clamped, items }
}

export async function leaveReport(event: H3Event, year: number) {
  const ctx = await requireTenantAbility(event, 'reports.read')
  const scope = await employeeScopeWhere(event, ctx)
  const [types, used] = await Promise.all([
    ensureLeaveTypes(ctx.tenantId),
    prisma.leaveRequest.groupBy({ by: ['employeeId', 'leaveTypeId'], where: { tenantId: ctx.tenantId, ...scope, status: 'approved', startDate: { gte: dateKeyToDb(`${year}-01-01`), lte: dateKeyToDb(`${year}-12-31`) } }, _sum: { days: true }, _count: { _all: true } })
  ])
  const employees = await prisma.employee.findMany({ where: { id: { in: [...new Set(used.map(u => u.employeeId))] } }, select: { id: true, fullName: true, employeeNumber: true } })
  const byType = types.map(t => ({ leaveTypeId: t.id, name: t.name, days: used.filter(u => u.leaveTypeId === t.id).reduce((s, u) => s + Number(u._sum.days ?? 0), 0), requests: used.filter(u => u.leaveTypeId === t.id).reduce((s, u) => s + u._count._all, 0) }))
  return {
    year, types: types.map(t => ({ id: t.id, name: t.name })), byType,
    items: employees.map(e => ({ employeeId: e.id, fullName: e.fullName, employeeNumber: e.employeeNumber, byType: Object.fromEntries(types.map(t => [t.id, Number(used.find(u => u.employeeId === e.id && u.leaveTypeId === t.id)?._sum.days ?? 0)])) })).sort((a, b) => a.fullName.localeCompare(b.fullName))
  }
}

export async function payrollReport(event: H3Event, year: number) {
  const ctx = await requireTenantAbility(event, 'payroll.read')
  await assertSensitiveReadAllowed(event, { fieldGroup: 'salary', targetType: 'payroll_report', targetId: String(year) })
  const runs = await prisma.payrollRun.findMany({ where: { tenantId: ctx.tenantId, periodYear: year, status: { in: ['approved', 'paid_recorded'] }, ...(ctx.branchIds ? { branchId: { in: ctx.branchIds } } : {}) }, orderBy: { periodMonth: 'asc' } })
  const months = Array.from({ length: 12 }, (_, i) => {
    const r = runs.filter(x => x.periodMonth === i + 1)
    const sum = (k: 'totalGross' | 'totalNet' | 'totalPph21' | 'totalEmployerCost' | 'totalDeductions') => r.reduce((s, x) => s + Number(x[k]), 0)
    return { month: i + 1, label: periodLabel(year, i + 1), runs: r.length, employees: r.reduce((s, x) => s + x.employeeCount, 0), gross: sum('totalGross'), deductions: sum('totalDeductions'), net: sum('totalNet'), pph21: sum('totalPph21'), employerCost: sum('totalEmployerCost') }
  })
  return { year, months, total: months.reduce((acc, m) => ({ gross: acc.gross + m.gross, net: acc.net + m.net, pph21: acc.pph21 + m.pph21, employerCost: acc.employerCost + m.employerCost }), { gross: 0, net: 0, pph21: 0, employerCost: 0 }) }
}

export const reportExportSchema = z.object({ kind: z.enum(['headcount', 'attendance', 'leave', 'payroll']), from: dateKeySchema.optional(), to: dateKeySchema.optional(), year: z.coerce.number().int().optional(), branchId: z.string().optional() })

export async function exportReportCsv(event: H3Event, query: z.infer<typeof reportExportSchema>) {
  const ctx = await requireTenantAbility(event, 'reports.read')
  await requireEntitlement(event, 'export')
  const today = todayKey(ctx.tenant.timezone)
  const from = query.from ?? `${today.slice(0, 7)}-01`
  const to = query.to ?? today
  const year = query.year ?? Number(today.slice(0, 4))
  await recordAudit(event, { audience: 'tenant', action: 'report.export', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'report', targetId: query.kind })
  if (query.kind === 'attendance') {
    const r = await attendanceReport(event, { from, to, branchId: query.branchId })
    return toCsv(['NIP', 'Nama', 'Kantor', 'Departemen', 'Hari kerja', 'Hadir', 'Terlambat', 'Alpa', 'Cuti', 'Menit terlambat', 'Jam kerja'], r.items.map(i => [i.employeeNumber, i.fullName, i.branchName, i.departmentName, i.scheduledDays, i.presentDays, i.lateDays, i.absentDays, i.leaveDays, i.lateMinutes, Math.round(i.workedMinutes / 6) / 10]))
  }
  if (query.kind === 'leave') {
    const r = await leaveReport(event, year)
    return toCsv(['NIP', 'Nama', ...r.types.map(t => t.name)], r.items.map(i => [i.employeeNumber, i.fullName, ...r.types.map(t => i.byType[t.id] ?? 0)]))
  }
  if (query.kind === 'payroll') {
    const r = await payrollReport(event, year)
    return toCsv(['Periode', 'Jumlah run', 'Karyawan', 'Bruto', 'Potongan', 'Bersih', 'PPh 21', 'Biaya perusahaan'], r.months.map(m => [m.label, m.runs, m.employees, m.gross, m.deductions, m.net, m.pph21, m.employerCost]))
  }
  const r = await headcountReport(event, { from, to, branchId: query.branchId })
  return toCsv(['Kelompok', 'Nilai', 'Jumlah'], [
    ...r.byStatus.map(s => ['Status', s.label, s.count]), ...r.byType.map(s => ['Jenis', s.label, s.count]),
    ...r.byBranch.map(s => ['Kantor', s.label, s.count]), ...r.byDepartment.map(s => ['Departemen', s.label, s.count]),
    ['Ringkasan', 'Masuk dalam periode', r.joiners], ['Ringkasan', 'Keluar dalam periode', r.leavers]
  ])
}

// ---------------------------------------------------------------------------
// Dashboard (manajemen) & beranda karyawan (ESS)
// ---------------------------------------------------------------------------

export async function tenantDashboard(event: H3Event) {
  const ctx = await requireTenantContext(event)
  const today = todayKey(ctx.tenant.timezone)
  const scope = await visibleEmployeesWhere(event, ctx)
  const canSee = (a: Parameters<typeof canTenantRole>[1]) => canTenantRole(ctx.role, a)
  // Bagian yang punya query paralel sendiri dijalankan berurutan (<= ~6 query paralel per request).
  const inbox = await approvalInboxCount(event)
  const attendance = canSee('attendance.read') ? (await dailyAttendance(event, { date: today, page: 1, limit: 1 })).counts : null
  const [employees, leaveToday, expiring, lastRun] = await Promise.all([
    canSee('employees.read') ? prisma.employee.count({ where: { AND: [scope, { status: { in: ['active', 'probation', 'on_leave'] } }] } }) : null,
    canSee('leave.read') ? prisma.leaveRequest.count({ where: { tenantId: ctx.tenantId, ...(await employeeScopeWhere(event, ctx)), status: 'approved', startDate: { lte: dateKeyToDb(today) }, endDate: { gte: dateKeyToDb(today) } } }) : null,
    canSee('employees.read') ? prisma.employee.count({ where: { AND: [scope, { status: { notIn: ['terminated', 'inactive'] }, contractEndDate: { gte: dateKeyToDb(today), lte: dateKeyToDb(addDaysToKey(today, 30)) } }] } }) : null,
    canSee('payroll.read') ? prisma.payrollRun.findFirst({ where: { tenantId: ctx.tenantId, status: { not: 'void' } }, orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }] }) : null
  ])
  const ent = await getEntitlements(ctx.tenantId)
  return {
    today,
    employees: employees === null ? null : { count: employees, limit: ent.limits.employees },
    pendingApprovals: inbox.count,
    attendance,
    onLeaveToday: leaveToday,
    contractsExpiring: expiring,
    lastPayroll: lastRun ? { id: lastRun.id, code: lastRun.code, periodLabel: periodLabel(lastRun.periodYear, lastRun.periodMonth), status: lastRun.status } : null,
    setup: canSee('employees.write')
      ? {
          hasEmployees: (employees ?? 0) > 0,
          hasSalary: (await prisma.employeeSalary.count({ where: { tenantId: ctx.tenantId } })) > 0,
          hasEssLogin: (await prisma.employee.count({ where: { tenantId: ctx.tenantId, tenantUserId: { not: null } } })) > 0
        }
      : null
  }
}

export async function myHome(event: H3Event) {
  const ctx = await requireTenantContext(event)
  const me = await ownEmployee(event, ctx)
  if (!me) return { linked: false as const }
  const tz = await branchTimezone(me.branchId)
  const today = todayKey(tz)
  const attendance = canTenantRole(ctx.role, 'attendance.self') ? await myAttendanceToday(event) : null
  const balances = canTenantRole(ctx.role, 'leave.self') ? await leaveBalances(ctx.tenantId, me, Number(today.slice(0, 4))) : []
  const payslips = canTenantRole(ctx.role, 'payslips.read.own') ? (await myPayslips(event)).items.slice(0, 1) : []
  const [pending, holidays] = await Promise.all([
    Promise.all([
      prisma.leaveRequest.count({ where: { employeeId: me.id, status: 'pending' } }),
      prisma.overtimeRequest.count({ where: { employeeId: me.id, status: 'pending' } }),
      prisma.reimbursement.count({ where: { employeeId: me.id, status: 'pending' } }),
      prisma.attendanceCorrection.count({ where: { employeeId: me.id, status: 'pending' } })
    ]),
    prisma.holiday.findMany({ where: { tenantId: ctx.tenantId, date: { gte: dateKeyToDb(today), lte: dateKeyToDb(addDaysToKey(today, 60)) }, OR: [{ branchId: null }, { branchId: me.branchId }] }, orderBy: { date: 'asc' }, take: 3 })
  ])
  return {
    linked: true as const,
    employee: { id: me.id, fullName: me.fullName, employeeNumber: me.employeeNumber },
    attendance,
    annualLeave: balances.find(b => b.code === 'ANNUAL') ?? balances.find(b => b.tracked) ?? null,
    latestPayslip: payslips[0] ?? null,
    pendingRequests: pending.reduce((s, n) => s + n, 0),
    upcomingHolidays: holidays.map(h => ({ date: dbDateToKey(h.date), name: h.name }))
  }
}
