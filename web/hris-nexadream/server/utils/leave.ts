import type { H3Event } from 'h3'
import { z } from 'zod'
import { DEFAULT_LEAVE_TYPES, RECORD_CODE_PREFIX } from '#shared/utils/hr'
import type { LeavePolicyItem } from '#shared/utils/identifiers'
import { fullMonthsBetween } from '#shared/utils/payroll-rules'
import { addDaysToKey, dateKeyToDb, dateKeysBetween, dbDateToKey, todayKey } from '#shared/utils/timezone'
import { formatDateId } from '#shared/utils/format'
import type { Employee, LeaveRequest, LeaveType, Prisma } from '~~/generated/prisma/client'

// 11.5 Cuti. Saldo = buku besar append-only (leave_ledger, idempoten per sourceId+reason).
// Hari cuti dihitung server dari jadwal kerja + libur kantor karyawan; klien tidak pernah menentukan jumlah hari.

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? null : Number(v.toString()))

/** Jenis cuti awal: dari kebijakan onboarding, atau bawaan UU Ketenagakerjaan. */
export async function ensureLeaveTypes(tenantId: string): Promise<LeaveType[]> {
  const existing = await prisma.leaveType.findMany({ where: { tenantId }, orderBy: [{ order: 'asc' }, { name: 'asc' }] })
  if (existing.length) return existing
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { leavePolicy: true } })
  const policy = Array.isArray(tenant?.leavePolicy) ? tenant.leavePolicy as unknown as LeavePolicyItem[] : []
  const defaults = DEFAULT_LEAVE_TYPES.map((d) => {
    const fromPolicy = policy.find(p => p.code?.toUpperCase() === d.code)
    return fromPolicy ? { ...d, name: fromPolicy.name || d.name, annualDays: fromPolicy.days ?? d.annualDays, eligibleAfterMonths: fromPolicy.eligibleAfterMonths ?? d.eligibleAfterMonths } : d
  })
  const extra = policy.filter(p => p.code && !DEFAULT_LEAVE_TYPES.some(d => d.code === p.code.toUpperCase()))
    .map(p => ({ code: p.code.toUpperCase(), name: p.name, annualDays: p.days, isPaid: true, requiresAttachment: false, eligibleAfterMonths: p.eligibleAfterMonths ?? 0, allowHalfDay: true, genderRestriction: null }))
  await prisma.leaveType.createMany({
    data: [...defaults, ...extra].map((t, order) => ({ tenantId, ...t, order })),
    skipDuplicates: true
  })
  return prisma.leaveType.findMany({ where: { tenantId }, orderBy: [{ order: 'asc' }, { name: 'asc' }] })
}

function toTypeView(t: LeaveType) {
  return { id: t.id, code: t.code, name: t.name, annualDays: num(t.annualDays), isPaid: t.isPaid, requiresAttachment: t.requiresAttachment, eligibleAfterMonths: t.eligibleAfterMonths, allowHalfDay: t.allowHalfDay, genderRestriction: t.genderRestriction, isActive: t.isActive, order: t.order }
}

export async function listLeaveTypes(event: H3Event) {
  const ctx = await requireTenantContext(event)
  return { items: (await ensureLeaveTypes(ctx.tenantId)).map(toTypeView) }
}

export const leaveTypeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,20}$/, 'Kode 2–20 huruf besar/angka.'),
  name: z.string().trim().min(2).max(80),
  annualDays: z.number().min(0.5).max(365).nullable(),
  isPaid: z.boolean(),
  requiresAttachment: z.boolean(),
  eligibleAfterMonths: z.number().int().min(0).max(120),
  allowHalfDay: z.boolean(),
  genderRestriction: z.enum(['male', 'female']).nullable(),
  isActive: z.boolean().optional(),
  order: z.number().int().min(0).max(100).optional()
})

export async function createLeaveType(event: H3Event, input: z.infer<typeof leaveTypeSchema>) {
  const ctx = await requireTenantAbility(event, 'leave.write')
  await requireEntitlement(event, 'leaveManagement')
  await ensureLeaveTypes(ctx.tenantId)
  const row = await prisma.leaveType.create({ data: { tenantId: ctx.tenantId, ...input } }).catch((e) => {
    if ((e as { code?: string }).code === 'P2002') throw conflict('Kode jenis cuti sudah dipakai.', { field: 'code' })
    throw e
  })
  await recordAudit(event, { audience: 'tenant', action: 'leave_type.create', actorId: ctx.user.id, actorName: ctx.user.name, tenantId: ctx.tenantId, targetType: 'leave_type', targetId: row.id })
  return toTypeView(row)
}

export async function updateLeaveType(event: H3Event, id: string, input: Partial<z.infer<typeof leaveTypeSchema>>) {
  const ctx = await requireTenantAbility(event, 'leave.write')
  await requireEntitlement(event, 'leaveManagement')
  if (!await prisma.leaveType.findFirst({ where: { id, tenantId: ctx.tenantId } })) throw notFound('Jenis cuti tidak ditemukan.')
  const { code: _code, ...rest } = input // kode tetap: dipakai ledger & laporan
  const row = await prisma.leaveType.update({ where: { id }, data: rest })
  await recordAudit(event, { audience: 'tenant', action: 'leave_type.update', actorId: ctx.user.id, actorName: ctx.user.name, tenantId: ctx.tenantId, targetType: 'leave_type', targetId: id })
  return toTypeView(row)
}

// ---------------------------------------------------------------------------
// Saldo (ledger)
// ---------------------------------------------------------------------------

function isEligible(employee: Pick<Employee, 'joinDate'>, type: LeaveType, onKey: string) {
  return fullMonthsBetween(dbDateToKey(employee.joinDate), onKey) >= type.eligibleAfterMonths
}

/** Hak tahunan (idempoten per karyawan/jenis/tahun). Dipanggil saat saldo dibaca & oleh cron harian. */
export async function grantAnnualEntitlements(tenantId: string, employees: Array<Pick<Employee, 'id' | 'joinDate' | 'gender'>>, year: number, onKey: string) {
  const types = (await ensureLeaveTypes(tenantId)).filter(t => t.isActive && t.annualDays !== null)
  const rows: Prisma.LeaveLedgerCreateManyInput[] = []
  for (const e of employees) {
    for (const t of types) {
      if (t.genderRestriction && e.gender && t.genderRestriction !== e.gender) continue
      if (!isEligible(e, t, onKey)) continue
      rows.push({ tenantId, employeeId: e.id, leaveTypeId: t.id, year, amount: t.annualDays!, reason: 'grant', sourceId: `grant:${e.id}:${t.id}:${year}`, note: `Hak ${t.name} ${year}` })
    }
  }
  if (rows.length) await prisma.leaveLedger.createMany({ data: rows, skipDuplicates: true })
  return rows.length
}

export async function leaveBalances(tenantId: string, employee: Employee, year: number) {
  const tz = await branchTimezone(employee.branchId)
  const today = todayKey(tz)
  if (String(year) === today.slice(0, 4)) await grantAnnualEntitlements(tenantId, [employee], year, today)
  const [types, ledger, pending] = await Promise.all([
    ensureLeaveTypes(tenantId),
    prisma.leaveLedger.groupBy({ by: ['leaveTypeId', 'reason'], where: { employeeId: employee.id, year }, _sum: { amount: true } }),
    prisma.leaveRequest.groupBy({ by: ['leaveTypeId'], where: { employeeId: employee.id, status: 'pending', startDate: { gte: dateKeyToDb(`${year}-01-01`), lte: dateKeyToDb(`${year}-12-31`) } }, _sum: { days: true } })
  ])
  return types.filter(t => t.isActive && (!t.genderRestriction || !employee.gender || t.genderRestriction === employee.gender)).map((t) => {
    const sum = (reasons: string[]) => ledger.filter(l => l.leaveTypeId === t.id && reasons.includes(l.reason)).reduce((s, l) => s + Number(l._sum.amount ?? 0), 0)
    const entitled = sum(['grant', 'carry_over', 'adjustment', 'expiry'])
    const used = -sum(['usage', 'usage_reversal'])
    const pendingDays = Number(pending.find(p => p.leaveTypeId === t.id)?._sum.days ?? 0)
    const tracked = t.annualDays !== null
    return {
      leaveTypeId: t.id, code: t.code, name: t.name, tracked, isPaid: t.isPaid, requiresAttachment: t.requiresAttachment, allowHalfDay: t.allowHalfDay,
      eligible: isEligible(employee, t, today),
      entitled, used, pending: pendingDays,
      available: tracked ? Math.round((entitled - used - pendingDays) * 10) / 10 : null
    }
  })
}

export const balanceQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() })

export async function employeeLeaveBalances(event: H3Event, employeeId: string, year?: number) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'leave.read', employeeId)
  const y = year ?? Number(todayKey(ctx.tenant.timezone).slice(0, 4))
  return { year: y, items: await leaveBalances(ctx.tenantId, employee, y) }
}

export const adjustmentSchema = z.object({
  leaveTypeId: z.string(),
  year: z.number().int().min(2000).max(2100),
  amount: z.number().min(-365).max(365).refine(v => v !== 0, 'Jumlah tidak boleh 0.'),
  note: z.string().trim().min(3, 'Tuliskan alasan penyesuaian.').max(200)
})

export async function adjustLeaveBalance(event: H3Event, employeeId: string, input: z.infer<typeof adjustmentSchema>) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'leave.write', employeeId)
  await requireEntitlement(event, 'leaveManagement')
  if (!await prisma.leaveType.findFirst({ where: { id: input.leaveTypeId, tenantId: ctx.tenantId } })) throw notFound('Jenis cuti tidak ditemukan.')
  await prisma.leaveLedger.create({ data: { tenantId: ctx.tenantId, employeeId: employee.id, leaveTypeId: input.leaveTypeId, year: input.year, amount: input.amount, reason: 'adjustment', sourceId: `adj:${randomToken(8)}`, note: input.note, createdById: ctx.user.id } })
  await recordAudit(event, { audience: 'tenant', action: 'leave.balance_adjust', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'employee', targetId: employee.id, metadata: { amount: input.amount, year: input.year } })
  return { success: true }
}

// ---------------------------------------------------------------------------
// Pengajuan
// ---------------------------------------------------------------------------

export const leaveRequestSchema = z.object({
  leaveTypeId: z.string().min(1, 'Pilih jenis cuti.'),
  startDate: dateKeySchema,
  endDate: dateKeySchema,
  halfDay: z.boolean().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  attachmentFileId: z.string().nullable().optional(),
  /** Admin HR mengajukan atas nama karyawan */
  employeeId: z.string().optional()
}).refine(v => v.endDate >= v.startDate, { message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.', path: ['endDate'] })

/** Hari kerja dalam rentang (jadwal + libur kantor). */
export async function workingDaysIn(tenantId: string, employee: Employee, startKey: string, endKey: string): Promise<number> {
  const keys = dateKeysBetween(startKey, endKey)
  if (keys.length > 120) throw httpError(400, 'VALIDATION_FAILED', 'Rentang cuti maksimal 120 hari.')
  const resolve = await buildScheduleResolver(tenantId, [employee], startKey, endKey)
  return keys.filter(k => resolve(employee, k).kind === 'work').length
}

async function createRequest(event: H3Event, ctx: TenantContext, employee: Employee, input: z.infer<typeof leaveRequestSchema>) {
  await requireEntitlement(event, 'leaveManagement')
  const type = await prisma.leaveType.findFirst({ where: { id: input.leaveTypeId, tenantId: ctx.tenantId, isActive: true } })
  if (!type) throw notFound('Jenis cuti tidak ditemukan.')
  if (type.genderRestriction && employee.gender && type.genderRestriction !== employee.gender) throw httpError(400, 'VALIDATION_FAILED', 'Jenis cuti ini tidak berlaku untuk Anda.', { field: 'leaveTypeId' })
  const halfDay = !!input.halfDay
  if (halfDay && (!type.allowHalfDay || input.startDate !== input.endDate)) throw httpError(400, 'VALIDATION_FAILED', 'Cuti setengah hari hanya untuk satu tanggal.', { field: 'halfDay' })
  if (type.requiresAttachment && !input.attachmentFileId) throw httpError(400, 'VALIDATION_FAILED', `${type.name} memerlukan lampiran (mis. surat dokter).`, { field: 'attachment' })
  if (input.attachmentFileId && !await prisma.storedFile.findFirst({ where: { id: input.attachmentFileId, tenantId: ctx.tenantId, purpose: 'receipt', deletedAt: null } })) {
    throw httpError(400, 'VALIDATION_FAILED', 'Lampiran tidak ditemukan. Unggah ulang.', { field: 'attachment' })
  }
  const tz = await branchTimezone(employee.branchId)
  const today = todayKey(tz)
  if (!isEligible(employee, type, input.startDate)) throw httpError(400, 'VALIDATION_FAILED', `${type.name} baru bisa diambil setelah ${type.eligibleAfterMonths} bulan bekerja.`, { field: 'leaveTypeId' })
  if (input.startDate < addDaysToKey(today, -30)) throw httpError(400, 'VALIDATION_FAILED', 'Tanggal mulai terlalu jauh ke belakang (maks. 30 hari).', { field: 'startDate' })
  const workDays = await workingDaysIn(ctx.tenantId, employee, input.startDate, input.endDate)
  const days = halfDay ? Math.min(0.5, workDays) : workDays
  if (days <= 0) throw httpError(400, 'VALIDATION_FAILED', 'Rentang itu tidak mengandung hari kerja.', { field: 'startDate' })
  const overlap = await prisma.leaveRequest.findFirst({ where: { employeeId: employee.id, status: { in: ['pending', 'approved'] }, startDate: { lte: dateKeyToDb(input.endDate) }, endDate: { gte: dateKeyToDb(input.startDate) } } })
  if (overlap) throw conflict(`Bertabrakan dengan pengajuan ${overlap.code}.`)
  if (type.annualDays !== null) {
    const balances = await leaveBalances(ctx.tenantId, employee, Number(input.startDate.slice(0, 4)))
    const bal = balances.find(b => b.leaveTypeId === type.id)
    if (!bal || (bal.available ?? 0) < days) throw httpError(400, 'INSUFFICIENT_BALANCE', `Saldo ${type.name} tidak cukup (tersisa ${bal?.available ?? 0} hari, dibutuhkan ${days}).`, { field: 'leaveTypeId' })
  }
  const steps = await planApprovalSteps(ctx.tenantId, 'leave', employee)
  const request = await prisma.$transaction(async (tx) => {
    const code = await nextRecordCode(tx, ctx.tenantId, RECORD_CODE_PREFIX.leave, ctx.tenant.timezone)
    const row = await tx.leaveRequest.create({
      data: { tenantId: ctx.tenantId, branchId: employee.branchId, employeeId: employee.id, leaveTypeId: type.id, code, startDate: dateKeyToDb(input.startDate), endDate: dateKeyToDb(input.endDate), halfDay, days, reason: input.reason ?? null, attachmentFileId: input.attachmentFileId ?? null, createdById: ctx.user.id }
    })
    await insertApprovalSteps(tx, { tenantId: ctx.tenantId, subjectType: 'leave', subjectId: row.id, steps })
    return row
  })
  await recordAudit(event, { audience: 'tenant', action: 'leave.request.create', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'leave_request', targetId: request.id })
  await notifyCurrentApprovers(ctx.tenantId, 'leave', request.id, employee, 'leave_requested', { leaveTypeName: type.name, startDate: formatDateId(input.startDate), endDate: formatDateId(input.endDate), days: String(days), reviewUrl: '/app/approvals' })
  return { id: request.id, code: request.code, days }
}

export async function createMyLeaveRequest(event: H3Event, input: z.infer<typeof leaveRequestSchema>) {
  const { ctx, employee } = await requireOwnEmployee(event, 'leave.self')
  return createRequest(event, ctx, employee, { ...input, employeeId: undefined })
}

export async function createLeaveRequestFor(event: H3Event, input: z.infer<typeof leaveRequestSchema>) {
  if (!input.employeeId) throw httpError(400, 'VALIDATION_FAILED', 'Pilih karyawan.', { field: 'employeeId' })
  const { ctx, employee } = await requireEmployeeAccess(event, 'leave.write', input.employeeId)
  return createRequest(event, ctx, employee, input)
}

/** Pratinjau jumlah hari kerja & saldo sebelum mengajukan (tanpa menulis apa pun). */
export async function previewLeaveDays(event: H3Event, query: { leaveTypeId: string, startDate: string, endDate: string, halfDay?: boolean }) {
  const { ctx, employee } = await requireOwnEmployee(event, 'leave.self')
  if (query.endDate < query.startDate) return { days: 0 }
  const workDays = await workingDaysIn(ctx.tenantId, employee, query.startDate, query.endDate)
  return { days: query.halfDay ? Math.min(0.5, workDays) : workDays }
}

type RequestWithRelations = LeaveRequest & { leaveType: { name: string }, employee: { id: string, fullName: string, employeeNumber: string, branchId: string } }

async function requestViews(rows: RequestWithRelations[], d?: DeciderContext) {
  const steps = await stepsFor('leave', rows.map(r => r.id))
  const names = await approverNamesFor([...steps.values()].flat())
  return rows.map((r) => {
    const s = steps.get(r.id) ?? []
    const step = currentStep(s)
    return {
      id: r.id, code: r.code, leaveTypeId: r.leaveTypeId, leaveTypeName: r.leaveType.name,
      employee: { id: r.employee.id, fullName: r.employee.fullName, employeeNumber: r.employee.employeeNumber },
      startDate: dbDateToKey(r.startDate), endDate: dbDateToKey(r.endDate), halfDay: r.halfDay, days: Number(r.days), reason: r.reason,
      hasAttachment: !!r.attachmentFileId, status: r.status, createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
      steps: s.map(x => toStepView(x, names)),
      canDecide: !!(d && step && r.status === 'pending' && canDecideStep(d, 'leave', step, r.employee))
    }
  })
}

const requestInclude = { leaveType: { select: { name: true } }, employee: { select: { id: true, fullName: true, employeeNumber: true, branchId: true } } } as const

export const leaveListSchema = listQuerySchema.extend({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  leaveTypeId: z.string().optional(),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  employeeId: z.string().optional()
})

export async function listLeaveRequests(event: H3Event, query: z.infer<typeof leaveListSchema>) {
  const ctx = await requireTenantAbility(event, 'leave.read')
  const where: Prisma.LeaveRequestWhereInput = {
    tenantId: ctx.tenantId, ...(await employeeScopeWhere(event, ctx)),
    ...(query.status ? { status: query.status } : {}), ...(query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {}),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.from ? { endDate: { gte: dateKeyToDb(query.from) } } : {}), ...(query.to ? { startDate: { lte: dateKeyToDb(query.to) } } : {}),
    ...(query.search ? { OR: [{ code: { contains: query.search, mode: 'insensitive' } }, { employee: { fullName: { contains: query.search, mode: 'insensitive' } } }] } : {})
  }
  const [rows, total] = await Promise.all([
    prisma.leaveRequest.findMany({ where, include: requestInclude, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.leaveRequest.count({ where })
  ])
  return { items: await requestViews(rows, { ctx, me: await ownEmployee(event, ctx) }), meta: listMeta(query.page, query.limit, total) }
}

export async function myLeave(event: H3Event, year?: number) {
  const { ctx, employee } = await requireOwnEmployee(event, 'leave.self')
  const y = year ?? Number(todayKey(await branchTimezone(employee.branchId)).slice(0, 4))
  const [balances, rows] = await Promise.all([
    leaveBalances(ctx.tenantId, employee, y),
    prisma.leaveRequest.findMany({ where: { employeeId: employee.id }, include: requestInclude, orderBy: { startDate: 'desc' }, take: 50 })
  ])
  return { year: y, balances, items: await requestViews(rows), featureAvailable: await can(ctx.tenantId, 'leaveManagement') }
}

export async function decideLeave(event: H3Event, id: string, decision: Decision) {
  const ctx = await requireTenantAbility(event, 'leave.read')
  const request = await prisma.leaveRequest.findFirst({ where: { id, tenantId: ctx.tenantId, ...(await employeeScopeWhere(event, ctx)) }, include: { leaveType: true, employee: true } })
  if (!request) throw notFound('Pengajuan cuti tidak ditemukan.')
  if (request.status !== 'pending') throw conflict('Pengajuan ini sudah diputuskan.')
  const d = { ctx, me: await ownEmployee(event, ctx) }
  const final = await prisma.$transaction(async (tx) => {
    const result = await decideCurrentStep(tx, d, { subjectType: 'leave', subjectId: id, requester: request.employee, decision })
    if (result) {
      await tx.leaveRequest.update({ where: { id }, data: { status: result, decidedAt: new Date() } })
      if (result === 'approved' && request.leaveType.annualDays !== null) {
        await tx.leaveLedger.create({ data: { tenantId: ctx.tenantId, employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year: request.startDate.getUTCFullYear(), amount: -Number(request.days), reason: 'usage', sourceId: request.id, note: request.code, createdById: ctx.user.id } })
      }
    }
    return result
  })
  await recordAudit(event, { audience: 'tenant', action: `leave.request.${decision.decision === 'approved' ? 'approve' : 'reject'}`, actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'leave_request', targetId: id })
  const vars = { leaveTypeName: request.leaveType.name, startDate: formatDateId(request.startDate, 'UTC'), endDate: formatDateId(request.endDate, 'UTC'), approverName: ctx.user.name, detailUrl: '/app/me/leave', reason: decision.note ?? '' }
  if (final === 'approved') await notifyRequester(ctx.tenantId, request.employee, 'leave_approved', vars)
  else if (final === 'rejected') await notifyRequester(ctx.tenantId, request.employee, 'leave_rejected', vars)
  else await notifyCurrentApprovers(ctx.tenantId, 'leave', id, request.employee, 'leave_requested', { leaveTypeName: request.leaveType.name, startDate: vars.startDate, endDate: vars.endDate, days: String(request.days), reviewUrl: '/app/approvals' })
  return { status: final ?? 'pending' }
}

/** Batal: pemohon (menunggu, atau disetujui & belum mulai) atau Admin HR (kapan saja). Saldo dikembalikan lewat ledger. */
export async function cancelLeave(event: H3Event, id: string, asSelf: boolean) {
  const ctx = asSelf ? (await requireOwnEmployee(event, 'leave.self')).ctx : await requireTenantAbility(event, 'leave.write')
  const me = await ownEmployee(event, ctx)
  const where: Prisma.LeaveRequestWhereInput = asSelf ? { id, employeeId: me?.id ?? '__none__' } : { id, tenantId: ctx.tenantId, ...(await employeeScopeWhere(event, ctx)) }
  const request = await prisma.leaveRequest.findFirst({ where, include: { leaveType: true } })
  if (!request) throw notFound('Pengajuan cuti tidak ditemukan.')
  if (request.status !== 'pending' && request.status !== 'approved') throw conflict('Pengajuan ini tidak bisa dibatalkan.')
  if (asSelf && request.status === 'approved' && dbDateToKey(request.startDate) <= todayKey(await branchTimezone(request.branchId))) {
    throw conflict('Cuti yang sudah dimulai hanya bisa dibatalkan Admin HR.')
  }
  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({ where: { id }, data: { status: 'cancelled', cancelledAt: new Date() } })
    await cancelApprovalSteps(tx, 'leave', id)
    if (request.status === 'approved' && request.leaveType.annualDays !== null) {
      await tx.leaveLedger.createMany({ data: [{ tenantId: request.tenantId, employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year: request.startDate.getUTCFullYear(), amount: Number(request.days), reason: 'usage_reversal', sourceId: request.id, note: `Batal ${request.code}`, createdById: ctx.user.id }], skipDuplicates: true })
    }
  })
  await recordAudit(event, { audience: 'tenant', action: 'leave.request.cancel', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'leave_request', targetId: id })
  return { success: true }
}

export async function leaveAttachmentUrl(event: H3Event, id: string) {
  const ctx = await requireTenantContext(event)
  const me = await ownEmployee(event, ctx)
  const request = await prisma.leaveRequest.findFirst({ where: { id, tenantId: ctx.tenantId } })
  if (!request?.attachmentFileId) throw notFound('Lampiran tidak ditemukan.')
  if (request.employeeId !== me?.id) {
    if (!canTenantRole(ctx.role, 'leave.read')) throw notFound('Lampiran tidak ditemukan.')
    const visible = await prisma.employee.findFirst({ where: { AND: [{ id: request.employeeId }, await visibleEmployeesWhere(event, ctx)] }, select: { id: true } })
    if (!visible) throw notFound('Lampiran tidak ditemukan.')
    // Lampiran cuti (mis. surat dokter) = data kesehatan: dicatat & diblokir saat impersonasi.
    await auditSensitiveRead(event, ctx, { employeeId: request.employeeId, fieldGroup: 'document' })
  }
  return signedFileUrl(ctx.tenantId, request.attachmentFileId)
}

export async function uploadRequestAttachment(event: H3Event) {
  const ctx = await requireTenantContext(event)
  const stored = await handleUpload(event, { audience: 'tenant', tenantId: ctx.tenantId, uploadedById: ctx.user.id }, 'receipt', `tenants/${ctx.tenantId}/requests`)
  return { id: stored.id }
}

/** Kalender cuti tim (disetujui + menunggu) untuk satu bulan. */
export async function leaveCalendar(event: H3Event, month: string) {
  const ctx = await requireTenantAbility(event, 'leave.read')
  const [y, m] = month.split('-').map(Number) as [number, number]
  const from = `${month}-01`
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const rows = await prisma.leaveRequest.findMany({
    where: { tenantId: ctx.tenantId, ...(await employeeScopeWhere(event, ctx)), status: { in: ['pending', 'approved'] }, startDate: { lte: dateKeyToDb(to) }, endDate: { gte: dateKeyToDb(from) } },
    include: requestInclude,
    orderBy: { startDate: 'asc' },
    take: 500
  })
  return { from, to, items: (await requestViews(rows)).map(({ steps: _s, canDecide: _c, ...r }) => r) }
}

/** Cron harian: hak cuti tahunan untuk karyawan yang baru memenuhi syarat (idempoten). */
export async function grantDueLeaveEntitlements(now = new Date()) {
  const key = now.toISOString().slice(0, 10)
  const year = Number(key.slice(0, 4))
  const tenants = await prisma.leaveType.findMany({ where: { isActive: true, annualDays: { not: null } }, distinct: ['tenantId'], select: { tenantId: true } })
  let granted = 0
  for (const { tenantId } of tenants) {
    const employees = await prisma.employee.findMany({ where: { tenantId, status: { in: ['active', 'probation', 'on_leave'] } }, select: { id: true, joinDate: true, gender: true } })
    for (let i = 0; i < employees.length; i += 500) granted += await grantAnnualEntitlements(tenantId, employees.slice(i, i + 500), year, key)
  }
  return { tenants: tenants.length, rowsConsidered: granted }
}
