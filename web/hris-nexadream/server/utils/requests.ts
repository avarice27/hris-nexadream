import type { H3Event } from 'h3'
import { z } from 'zod'
import { RECORD_CODE_PREFIX, REIMBURSEMENT_CATEGORIES, REIMBURSEMENT_CATEGORY_LABELS, type ApprovalSubject } from '#shared/utils/hr'
import { maxOvertimeMinutes } from '#shared/utils/payroll-rules'
import { formatIDR } from '#shared/utils/format'
import { addDaysToKey, dateKeyToDb, dbDateToKey, todayKey, zonedInstant, zonedTimeLabel } from '#shared/utils/timezone'
import type { Employee, OvertimeRequest, Prisma, Reimbursement } from '~~/generated/prisma/client'

// 11.6 Lembur & reimbursement. Keduanya memakai mekanisme persetujuan bersama dan masuk ke payroll
// bulan terkait setelah disetujui (payrollRunId diisi saat run disetujui, dilepas saat run dibatalkan).

type EmployeeBrief = { id: string, fullName: string, employeeNumber: string, branchId: string }
const employeeSelect = { id: true, fullName: true, employeeNumber: true, branchId: true } as const

function audit(event: H3Event, ctx: TenantContext, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  return recordAudit(event, { audience: 'tenant', action, actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType, targetId, metadata })
}

async function resolveRequester(event: H3Event, selfAbility: 'overtime.self' | 'reimbursement.self', hrAbility: 'overtime.approve' | 'reimbursement.approve', employeeId?: string) {
  if (!employeeId) return requireOwnEmployee(event, selfAbility)
  const result = await requireEmployeeAccess(event, hrAbility, employeeId)
  // Atas nama orang lain hanya untuk owner/Admin HR.
  if (!seesAllEmployees(result.ctx)) throw forbidden()
  return result
}

async function decorate<T extends { id: string, status: string, employee: EmployeeBrief }>(subject: ApprovalSubject, rows: T[], d?: DeciderContext) {
  const steps = await stepsFor(subject, rows.map(r => r.id))
  const names = await approverNamesFor([...steps.values()].flat())
  return rows.map((r) => {
    const s = steps.get(r.id) ?? []
    const step = currentStep(s)
    return { steps: s.map(x => toStepView(x, names)), canDecide: !!(d && step && r.status === 'pending' && canDecideStep(d, subject, step, r.employee)) }
  })
}

// ---------------------------------------------------------------------------
// Lembur
// ---------------------------------------------------------------------------

export const overtimeSchema = z.object({
  workDate: dateKeySchema,
  startTime: timeSchema,
  endTime: timeSchema,
  reason: z.string().trim().min(5, 'Jelaskan pekerjaan lembur (minimal 5 karakter).').max(300),
  employeeId: z.string().optional()
})

async function overtimeView(rows: Array<OvertimeRequest & { employee: EmployeeBrief & { branch: { timezone: string } } }>, d?: DeciderContext) {
  const extras = await decorate('overtime', rows, d)
  return rows.map((r, i) => ({
    id: r.id, code: r.code, workDate: dbDateToKey(r.workDate), startTime: zonedTimeLabel(r.startAt, r.employee.branch.timezone), endTime: zonedTimeLabel(r.endAt, r.employee.branch.timezone),
    minutes: r.minutes, dayType: r.dayType, reason: r.reason, status: r.status, paid: !!r.payrollRunId, createdAt: r.createdAt.toISOString(),
    employee: { id: r.employee.id, fullName: r.employee.fullName, employeeNumber: r.employee.employeeNumber }, ...extras[i]!
  }))
}

const overtimeInclude = { employee: { select: { ...employeeSelect, branch: { select: { timezone: true } } } } } as const

export async function createOvertime(event: H3Event, input: z.infer<typeof overtimeSchema>) {
  const { ctx, employee } = await resolveRequester(event, 'overtime.self', 'overtime.approve', input.employeeId)
  await requireEntitlement(event, 'overtime')
  const tz = await branchTimezone(employee.branchId)
  const today = todayKey(tz)
  if (input.workDate > addDaysToKey(today, 30) || input.workDate < addDaysToKey(today, -31)) throw httpError(400, 'VALIDATION_FAILED', 'Tanggal lembur harus dalam 31 hari terakhir atau 30 hari ke depan.', { field: 'workDate' })
  const startAt = zonedInstant(input.workDate, input.startTime, tz)
  let endAt = zonedInstant(input.workDate, input.endTime, tz)
  if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86400_000)
  const minutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000)
  const resolve = await buildScheduleResolver(ctx.tenantId, [employee], input.workDate, input.workDate)
  const schedule = resolve(employee, input.workDate)
  const dayType = schedule.kind === 'holiday' ? 'holiday' : schedule.kind === 'off' ? 'rest_day' : 'workday'
  if (minutes < 30) throw httpError(400, 'VALIDATION_FAILED', 'Lembur minimal 30 menit.', { field: 'endTime' })
  if (minutes > maxOvertimeMinutes(dayType)) throw httpError(400, 'VALIDATION_FAILED', dayType === 'workday' ? 'Lembur pada hari kerja maksimal 4 jam (PP 35/2021).' : 'Lembur pada hari libur maksimal 11 jam.', { field: 'endTime' })
  // Lembur hari kerja tidak boleh tumpang tindih dengan jam kerja terjadwal.
  const window = scheduledInstants(schedule, tz)
  if (window && startAt < window.end && endAt > window.start) throw httpError(400, 'VALIDATION_FAILED', `Lembur harus di luar jam kerja (${schedule.startTime}–${schedule.endTime}).`, { field: 'startTime' })
  const overlap = await prisma.overtimeRequest.findFirst({ where: { employeeId: employee.id, status: { in: ['pending', 'approved'] }, startAt: { lt: endAt }, endAt: { gt: startAt } } })
  if (overlap) throw conflict(`Bertabrakan dengan pengajuan ${overlap.code}.`)
  const steps = await planApprovalSteps(ctx.tenantId, 'overtime', employee)
  const row = await prisma.$transaction(async (tx) => {
    const code = await nextRecordCode(tx, ctx.tenantId, RECORD_CODE_PREFIX.overtime, ctx.tenant.timezone)
    const created = await tx.overtimeRequest.create({ data: { tenantId: ctx.tenantId, branchId: employee.branchId, employeeId: employee.id, code, workDate: dateKeyToDb(input.workDate), startAt, endAt, minutes, dayType, reason: input.reason, createdById: ctx.user.id } })
    await insertApprovalSteps(tx, { tenantId: ctx.tenantId, subjectType: 'overtime', subjectId: created.id, steps })
    return created
  })
  await audit(event, ctx, 'overtime.create', 'overtime_request', row.id)
  await notifyCurrentApprovers(ctx.tenantId, 'overtime', row.id, employee, 'overtime_requested', { requestUrl: '/app/approvals' })
  return { id: row.id, code: row.code, minutes, dayType }
}

export const requestListSchema = listQuerySchema.extend({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  employeeId: z.string().optional()
})

export async function listOvertime(event: H3Event, query: z.infer<typeof requestListSchema>) {
  const ctx = await requireTenantAbility(event, 'overtime.read')
  const where: Prisma.OvertimeRequestWhereInput = {
    tenantId: ctx.tenantId, ...(await employeeScopeWhere(event, ctx)), ...(query.status ? { status: query.status } : {}), ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.from || query.to ? { workDate: { ...(query.from ? { gte: dateKeyToDb(query.from) } : {}), ...(query.to ? { lte: dateKeyToDb(query.to) } : {}) } } : {}),
    ...(query.search ? { OR: [{ code: { contains: query.search, mode: 'insensitive' } }, { employee: { fullName: { contains: query.search, mode: 'insensitive' } } }] } : {})
  }
  const [rows, total] = await Promise.all([
    prisma.overtimeRequest.findMany({ where, include: overtimeInclude, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.overtimeRequest.count({ where })
  ])
  return { items: await overtimeView(rows, { ctx, me: await ownEmployee(event, ctx) }), meta: listMeta(query.page, query.limit, total) }
}

export async function myOvertime(event: H3Event) {
  const { ctx, employee } = await requireOwnEmployee(event, 'overtime.self')
  const rows = await prisma.overtimeRequest.findMany({ where: { employeeId: employee.id }, include: overtimeInclude, orderBy: { workDate: 'desc' }, take: 50 })
  return { items: await overtimeView(rows), featureAvailable: await can(ctx.tenantId, 'overtime') }
}

export async function decideOvertime(event: H3Event, id: string, decision: Decision) {
  const ctx = await requireTenantAbility(event, 'overtime.read')
  const row = await prisma.overtimeRequest.findFirst({ where: { id, tenantId: ctx.tenantId, ...(await employeeScopeWhere(event, ctx)) }, include: { employee: true } })
  if (!row) throw notFound('Pengajuan lembur tidak ditemukan.')
  if (row.status !== 'pending') throw conflict('Pengajuan ini sudah diputuskan.')
  const d = { ctx, me: await ownEmployee(event, ctx) }
  const final = await prisma.$transaction(async (tx) => {
    const result = await decideCurrentStep(tx, d, { subjectType: 'overtime', subjectId: id, requester: row.employee, decision })
    if (result) await tx.overtimeRequest.update({ where: { id }, data: { status: result, decidedAt: new Date() } })
    return result
  })
  await audit(event, ctx, `overtime.${decision.decision === 'approved' ? 'approve' : 'reject'}`, 'overtime_request', id)
  await afterDecision(ctx, 'overtime', row.employee, final, id, 'lembur', '/app/me/overtime', 'overtime_requested')
  return { status: final ?? 'pending' }
}

async function afterDecision(ctx: TenantContext, subject: ApprovalSubject, employee: Employee, final: 'approved' | 'rejected' | null, id: string, label: string, detailUrl: string, approverTemplate: string) {
  if (final) await notifyRequester(ctx.tenantId, employee, 'request_decided', { requestTypeLabel: label, decisionLabel: final === 'approved' ? 'disetujui' : 'ditolak', detailUrl })
  else await notifyCurrentApprovers(ctx.tenantId, subject, id, employee, approverTemplate, { requestUrl: '/app/approvals' })
}

export async function cancelOvertime(event: H3Event, id: string) {
  const { employee } = await requireOwnEmployee(event, 'overtime.self')
  const row = await prisma.overtimeRequest.findFirst({ where: { id, employeeId: employee.id } })
  if (!row) throw notFound('Pengajuan tidak ditemukan.')
  if (row.status !== 'pending') throw conflict('Hanya pengajuan yang menunggu yang bisa dibatalkan.')
  await prisma.$transaction(async (tx) => {
    await tx.overtimeRequest.update({ where: { id }, data: { status: 'cancelled' } })
    await cancelApprovalSteps(tx, 'overtime', id)
  })
  return { success: true }
}

// ---------------------------------------------------------------------------
// Reimbursement
// ---------------------------------------------------------------------------

export const reimbursementSchema = z.object({
  category: z.enum(REIMBURSEMENT_CATEGORIES),
  expenseDate: dateKeySchema,
  amount: z.number({ error: 'Masukkan nominal.' }).min(1000, 'Nominal minimal Rp 1.000.').max(500_000_000),
  description: z.string().trim().min(3, 'Jelaskan pengeluaran.').max(300),
  receiptFileId: z.string().nullable().optional(),
  employeeId: z.string().optional()
})

export const reimbursementDecisionSchema = decisionSchema.extend({ approvedAmount: z.number().min(0).max(500_000_000).nullable().optional() })

async function reimbursementView(rows: Array<Reimbursement & { employee: EmployeeBrief }>, d?: DeciderContext) {
  const extras = await decorate('reimbursement', rows, d)
  return rows.map((r, i) => ({
    id: r.id, code: r.code, category: r.category, categoryLabel: REIMBURSEMENT_CATEGORY_LABELS[r.category as keyof typeof REIMBURSEMENT_CATEGORY_LABELS] ?? r.category,
    expenseDate: dbDateToKey(r.expenseDate), amount: Number(r.amount), approvedAmount: r.approvedAmount === null ? null : Number(r.approvedAmount),
    description: r.description, hasReceipt: !!r.receiptFileId, status: r.status, paid: !!r.payrollRunId, createdAt: r.createdAt.toISOString(),
    employee: { id: r.employee.id, fullName: r.employee.fullName, employeeNumber: r.employee.employeeNumber }, ...extras[i]!
  }))
}

export async function createReimbursement(event: H3Event, input: z.infer<typeof reimbursementSchema>) {
  const { ctx, employee } = await resolveRequester(event, 'reimbursement.self', 'reimbursement.approve', input.employeeId)
  await requireEntitlement(event, 'reimbursement')
  const today = todayKey(await branchTimezone(employee.branchId))
  if (input.expenseDate > today) throw httpError(400, 'VALIDATION_FAILED', 'Tanggal pengeluaran tidak boleh di masa depan.', { field: 'expenseDate' })
  if (input.expenseDate < addDaysToKey(today, -90)) throw httpError(400, 'VALIDATION_FAILED', 'Klaim maksimal 90 hari setelah pengeluaran.', { field: 'expenseDate' })
  if (input.receiptFileId && !await prisma.storedFile.findFirst({ where: { id: input.receiptFileId, tenantId: ctx.tenantId, purpose: 'receipt', deletedAt: null } })) {
    throw httpError(400, 'VALIDATION_FAILED', 'Bukti tidak ditemukan. Unggah ulang.', { field: 'receipt' })
  }
  const steps = await planApprovalSteps(ctx.tenantId, 'reimbursement', employee)
  const row = await prisma.$transaction(async (tx) => {
    const code = await nextRecordCode(tx, ctx.tenantId, RECORD_CODE_PREFIX.reimbursement, ctx.tenant.timezone)
    const created = await tx.reimbursement.create({ data: { tenantId: ctx.tenantId, branchId: employee.branchId, employeeId: employee.id, code, category: input.category, expenseDate: dateKeyToDb(input.expenseDate), amount: input.amount, description: input.description, receiptFileId: input.receiptFileId ?? null, createdById: ctx.user.id } })
    await insertApprovalSteps(tx, { tenantId: ctx.tenantId, subjectType: 'reimbursement', subjectId: created.id, steps })
    return created
  })
  await audit(event, ctx, 'reimbursement.create', 'reimbursement', row.id)
  await notifyCurrentApprovers(ctx.tenantId, 'reimbursement', row.id, employee, 'reimbursement_requested', { requestUrl: '/app/approvals' })
  return { id: row.id, code: row.code }
}

export async function listReimbursements(event: H3Event, query: z.infer<typeof requestListSchema>) {
  const ctx = await requireTenantAbility(event, 'reimbursement.read')
  const where: Prisma.ReimbursementWhereInput = {
    tenantId: ctx.tenantId, ...(await employeeScopeWhere(event, ctx)), ...(query.status ? { status: query.status } : {}), ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.from || query.to ? { expenseDate: { ...(query.from ? { gte: dateKeyToDb(query.from) } : {}), ...(query.to ? { lte: dateKeyToDb(query.to) } : {}) } } : {}),
    ...(query.search ? { OR: [{ code: { contains: query.search, mode: 'insensitive' } }, { employee: { fullName: { contains: query.search, mode: 'insensitive' } } }] } : {})
  }
  const [rows, total, sums] = await Promise.all([
    prisma.reimbursement.findMany({ where, include: { employee: { select: employeeSelect } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.reimbursement.count({ where }),
    prisma.reimbursement.groupBy({ by: ['status'], where, _sum: { amount: true, approvedAmount: true } })
  ])
  return {
    items: await reimbursementView(rows, { ctx, me: await ownEmployee(event, ctx) }),
    meta: listMeta(query.page, query.limit, total),
    totals: { pending: Number(sums.find(s => s.status === 'pending')?._sum.amount ?? 0), approved: Number(sums.find(s => s.status === 'approved')?._sum.approvedAmount ?? 0) }
  }
}

export async function myReimbursements(event: H3Event) {
  const { ctx, employee } = await requireOwnEmployee(event, 'reimbursement.self')
  const rows = await prisma.reimbursement.findMany({ where: { employeeId: employee.id }, include: { employee: { select: employeeSelect } }, orderBy: { createdAt: 'desc' }, take: 50 })
  return { items: await reimbursementView(rows), featureAvailable: await can(ctx.tenantId, 'reimbursement') }
}

export async function decideReimbursement(event: H3Event, id: string, input: z.infer<typeof reimbursementDecisionSchema>) {
  const ctx = await requireTenantAbility(event, 'reimbursement.read')
  const row = await prisma.reimbursement.findFirst({ where: { id, tenantId: ctx.tenantId, ...(await employeeScopeWhere(event, ctx)) }, include: { employee: true } })
  if (!row) throw notFound('Pengajuan reimbursement tidak ditemukan.')
  if (row.status !== 'pending') throw conflict('Pengajuan ini sudah diputuskan.')
  if (input.approvedAmount != null && input.approvedAmount > Number(row.amount)) throw httpError(400, 'VALIDATION_FAILED', 'Nominal disetujui tidak boleh melebihi nominal klaim.', { field: 'approvedAmount' })
  const d = { ctx, me: await ownEmployee(event, ctx) }
  const final = await prisma.$transaction(async (tx) => {
    const result = await decideCurrentStep(tx, d, { subjectType: 'reimbursement', subjectId: id, requester: row.employee, decision: input })
    if (result) await tx.reimbursement.update({ where: { id }, data: { status: result, decidedAt: new Date(), approvedAmount: result === 'approved' ? (input.approvedAmount ?? row.amount) : null } })
    else if (input.approvedAmount != null) await tx.reimbursement.update({ where: { id }, data: { approvedAmount: input.approvedAmount } })
    return result
  })
  await audit(event, ctx, `reimbursement.${input.decision === 'approved' ? 'approve' : 'reject'}`, 'reimbursement', id)
  await afterDecision(ctx, 'reimbursement', row.employee, final, id, 'reimbursement', '/app/me/reimbursements', 'reimbursement_requested')
  return { status: final ?? 'pending' }
}

export async function cancelReimbursement(event: H3Event, id: string) {
  const { employee } = await requireOwnEmployee(event, 'reimbursement.self')
  const row = await prisma.reimbursement.findFirst({ where: { id, employeeId: employee.id } })
  if (!row) throw notFound('Pengajuan tidak ditemukan.')
  if (row.status !== 'pending') throw conflict('Hanya pengajuan yang menunggu yang bisa dibatalkan.')
  await prisma.$transaction(async (tx) => {
    await tx.reimbursement.update({ where: { id }, data: { status: 'cancelled' } })
    await cancelApprovalSteps(tx, 'reimbursement', id)
  })
  return { success: true }
}

export async function reimbursementReceiptUrl(event: H3Event, id: string) {
  const ctx = await requireTenantContext(event)
  const me = await ownEmployee(event, ctx)
  const row = await prisma.reimbursement.findFirst({ where: { id, tenantId: ctx.tenantId } })
  if (!row?.receiptFileId) throw notFound('Bukti tidak ditemukan.')
  if (row.employeeId !== me?.id) {
    if (!canTenantRole(ctx.role, 'reimbursement.read')) throw notFound('Bukti tidak ditemukan.')
    const visible = await prisma.employee.findFirst({ where: { AND: [{ id: row.employeeId }, await visibleEmployeesWhere(event, ctx)] }, select: { id: true } })
    if (!visible) throw notFound('Bukti tidak ditemukan.')
  }
  return signedFileUrl(ctx.tenantId, row.receiptFileId)
}

// ---------------------------------------------------------------------------
// Kotak masuk persetujuan (atasan & Admin HR)
// ---------------------------------------------------------------------------

export async function approvalInbox(event: H3Event) {
  const ctx = await requireTenantContext(event)
  const d = { ctx, me: await ownEmployee(event, ctx) }
  const scope = await employeeScopeWhere(event, ctx)
  const leaveIds = canTenantRole(ctx.role, 'leave.approve') ? await decidableSubjectIds(event, ctx, 'leave') : []
  const overtimeIds = canTenantRole(ctx.role, 'overtime.approve') ? await decidableSubjectIds(event, ctx, 'overtime') : []
  const reimbursementIds = canTenantRole(ctx.role, 'reimbursement.approve') ? await decidableSubjectIds(event, ctx, 'reimbursement') : []
  const correctionIds = canTenantRole(ctx.role, 'attendance.read') ? await decidableSubjectIds(event, ctx, 'attendance_correction') : []
  const [leave, overtime, reimbursements, corrections] = await Promise.all([
    leaveIds.length ? prisma.leaveRequest.findMany({ where: { id: { in: leaveIds }, status: 'pending', ...scope }, include: { leaveType: { select: { name: true } }, employee: { select: employeeSelect } }, orderBy: { createdAt: 'asc' } }) : [],
    overtimeIds.length ? prisma.overtimeRequest.findMany({ where: { id: { in: overtimeIds }, status: 'pending', ...scope }, include: overtimeInclude, orderBy: { createdAt: 'asc' } }) : [],
    reimbursementIds.length ? prisma.reimbursement.findMany({ where: { id: { in: reimbursementIds }, status: 'pending', ...scope }, include: { employee: { select: employeeSelect } }, orderBy: { createdAt: 'asc' } }) : [],
    correctionIds.length ? prisma.attendanceCorrection.findMany({ where: { id: { in: correctionIds }, status: 'pending', ...scope }, orderBy: { createdAt: 'asc' } }) : []
  ])
  const correctionEmployees = new Map((await prisma.employee.findMany({ where: { id: { in: corrections.map(c => c.employeeId) } }, select: { ...employeeSelect, branch: { select: { timezone: true } } } })).map(e => [e.id, e]))
  const items = [
    ...leave.map(r => ({ type: 'leave' as const, id: r.id, code: r.code, employee: r.employee, createdAt: r.createdAt.toISOString(), summary: `${r.leaveType.name} · ${Number(r.days)} hari`, detail: { startDate: dbDateToKey(r.startDate), endDate: dbDateToKey(r.endDate), reason: r.reason, hasAttachment: !!r.attachmentFileId } })),
    ...(await overtimeView(overtime, d)).map(r => ({ type: 'overtime' as const, id: r.id, code: r.code, employee: r.employee, createdAt: r.createdAt, summary: `${Math.floor(r.minutes / 60)} j ${r.minutes % 60} m · ${r.workDate}`, detail: { workDate: r.workDate, startTime: r.startTime, endTime: r.endTime, dayType: r.dayType, reason: r.reason } })),
    ...reimbursements.map(r => ({ type: 'reimbursement' as const, id: r.id, code: r.code, employee: r.employee, createdAt: r.createdAt.toISOString(), summary: `${REIMBURSEMENT_CATEGORY_LABELS[r.category as keyof typeof REIMBURSEMENT_CATEGORY_LABELS] ?? r.category} · ${formatIDR(Number(r.amount))}`, detail: { amount: Number(r.amount), expenseDate: dbDateToKey(r.expenseDate), description: r.description, hasReceipt: !!r.receiptFileId } })),
    ...corrections.map((c) => {
      const e = correctionEmployees.get(c.employeeId)
      const tz = e?.branch.timezone ?? 'Asia/Jakarta'
      return { type: 'attendance_correction' as const, id: c.id, code: c.code, employee: e ?? { id: c.employeeId, fullName: '-', employeeNumber: '-', branchId: c.branchId }, createdAt: c.createdAt.toISOString(), summary: `Koreksi absen ${dbDateToKey(c.workDate)}`, detail: { workDate: dbDateToKey(c.workDate), requestedClockIn: c.requestedClockIn ? zonedTimeLabel(c.requestedClockIn, tz) : null, requestedClockOut: c.requestedClockOut ? zonedTimeLabel(c.requestedClockOut, tz) : null, reason: c.reason } }
    })
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return { items: items.map(i => ({ ...i, employee: { id: i.employee.id, fullName: i.employee.fullName, employeeNumber: i.employee.employeeNumber } })), total: items.length }
}

/** Jumlah untuk lencana menu. */
export async function approvalInboxCount(event: H3Event) {
  const ctx = await requireTenantContext(event)
  if (ctx.role === 'employee') return { count: 0 }
  const subjects: ApprovalSubject[] = ['leave', 'overtime', 'reimbursement', 'attendance_correction']
  let count = 0
  for (const s of subjects) count += (await decidableSubjectIds(event, ctx, s)).length
  return { count }
}
