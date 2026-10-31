import type { H3Event } from 'h3'
import { z } from 'zod'
import { DEFAULT_SALARY_COMPONENTS } from '#shared/utils/hr'
import {
  bpjsContributions, finalPeriodTax, grossUpAllowance, isPtkpStatus, monthlyTerTax, overtimePay, terCategory, thrAmount,
  type OvertimeDayType, type PayslipData, type PayslipLine, type PtkpStatus, type TaxMethod
} from '#shared/utils/payroll-rules'
import { dateKeyToDb, dateKeysBetween, dbDateToKey, todayKey } from '#shared/utils/timezone'
import { formatIDR } from '#shared/utils/format'
import { toCsv } from '#shared/utils/csv'
import type { Employee, PayrollRun, Prisma, SalaryComponent } from '~~/generated/prisma/client'
import type { SalaryData } from './employee-records'

// 11.7 Payroll (D5: dihitung & dicatat — transfer gaji di luar platform).
// Status run: draft → approved → paid_recorded; run yang disetujui TIDAK PERNAH diubah: void + run ulang.
// Perhitungan per karyawan berjalan dalam potongan (CHUNK) yang bisa dilanjutkan & idempoten
// (payslip unik per run+karyawan), agar tidak ada satu request panjang di Vercel.

const CHUNK = 25
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
export const periodLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`

function audit(event: H3Event, ctx: TenantContext, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  return recordAudit(event, { audience: 'tenant', action, actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType, targetId, metadata })
}

// ---------------------------------------------------------------------------
// Komponen gaji
// ---------------------------------------------------------------------------

export async function ensureSalaryComponents(tenantId: string): Promise<SalaryComponent[]> {
  const existing = await prisma.salaryComponent.findMany({ where: { tenantId }, orderBy: [{ order: 'asc' }, { name: 'asc' }] })
  if (existing.length) return existing
  await prisma.salaryComponent.createMany({ data: DEFAULT_SALARY_COMPONENTS.map((c, order) => ({ tenantId, ...c, order })), skipDuplicates: true })
  return prisma.salaryComponent.findMany({ where: { tenantId }, orderBy: [{ order: 'asc' }, { name: 'asc' }] })
}

export async function listSalaryComponents(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'payroll.read')
  return { items: (await ensureSalaryComponents(ctx.tenantId)).map(c => ({ id: c.id, code: c.code, name: c.name, kind: c.kind, taxable: c.taxable, bpjsBase: c.bpjsBase, thrBase: c.thrBase, isActive: c.isActive, order: c.order })) }
}

export const componentSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/, 'Kode 2–30 huruf besar/angka/garis bawah.'),
  name: z.string().trim().min(2).max(80),
  kind: z.enum(['earning', 'deduction']),
  taxable: z.boolean(),
  bpjsBase: z.boolean(),
  thrBase: z.boolean(),
  isActive: z.boolean().optional(),
  order: z.number().int().min(0).max(100).optional()
})

export async function createSalaryComponent(event: H3Event, input: z.infer<typeof componentSchema>) {
  const ctx = await requireTenantAbility(event, 'payroll.write')
  await requireEntitlement(event, 'payroll')
  await ensureSalaryComponents(ctx.tenantId)
  const row = await prisma.salaryComponent.create({ data: { tenantId: ctx.tenantId, ...input, bpjsBase: input.kind === 'earning' && input.bpjsBase, thrBase: input.kind === 'earning' && input.thrBase } }).catch((e) => {
    if ((e as { code?: string }).code === 'P2002') throw conflict('Kode komponen sudah dipakai.', { field: 'code' })
    throw e
  })
  await audit(event, ctx, 'salary_component.create', 'salary_component', row.id)
  return { id: row.id }
}

export async function updateSalaryComponent(event: H3Event, id: string, input: Partial<z.infer<typeof componentSchema>>) {
  const ctx = await requireTenantAbility(event, 'payroll.write')
  await requireEntitlement(event, 'payroll')
  const row = await prisma.salaryComponent.findFirst({ where: { id, tenantId: ctx.tenantId } })
  if (!row) throw notFound('Komponen tidak ditemukan.')
  const { code: _code, kind: _kind, ...rest } = input // kode & jenis tetap: dipakai riwayat gaji
  await prisma.salaryComponent.update({ where: { id }, data: rest })
  await audit(event, ctx, 'salary_component.update', 'salary_component', id)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export const runCreateSchema = z.object({
  periodYear: z.number().int().min(2020).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  branchId: z.string().nullable().optional(),
  includeThr: z.boolean().optional(),
  note: z.string().trim().max(300).nullable().optional()
})

function periodKeys(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return { start, end }
}

/** Karyawan yang digaji dalam periode (termasuk yang berhenti di tengah periode — gaji terakhir). */
function eligibleWhere(run: Pick<PayrollRun, 'tenantId' | 'branchId' | 'periodStart' | 'periodEnd'>): Prisma.EmployeeWhereInput {
  return {
    tenantId: run.tenantId,
    ...(run.branchId ? { branchId: run.branchId } : {}),
    joinDate: { lte: run.periodEnd },
    status: { not: 'inactive' },
    OR: [{ endDate: null }, { endDate: { gte: run.periodStart } }]
  }
}

function toRunView(r: PayrollRun, branchName?: string | null) {
  return {
    id: r.id, code: r.code, periodYear: r.periodYear, periodMonth: r.periodMonth, periodLabel: periodLabel(r.periodYear, r.periodMonth),
    periodStart: dbDateToKey(r.periodStart), periodEnd: dbDateToKey(r.periodEnd), branchId: r.branchId, branchName: branchName ?? null,
    includeThr: r.includeThr, status: r.status, employeeCount: r.employeeCount, calculatedCount: r.calculatedCount,
    totalGross: Number(r.totalGross), totalDeductions: Number(r.totalDeductions), totalNet: Number(r.totalNet), totalPph21: Number(r.totalPph21), totalEmployerCost: Number(r.totalEmployerCost),
    calculatedAt: r.calculatedAt?.toISOString() ?? null, approvedAt: r.approvedAt?.toISOString() ?? null, paidRecordedAt: r.paidRecordedAt?.toISOString() ?? null,
    paidDate: r.paidDate ? dbDateToKey(r.paidDate) : null, voidedAt: r.voidedAt?.toISOString() ?? null, voidReason: r.voidReason, replacesRunId: r.replacesRunId, note: r.note,
    createdAt: r.createdAt.toISOString()
  }
}

export async function listPayrollRuns(event: H3Event, query: { page: number, limit: number }) {
  const ctx = await requireTenantAbility(event, 'payroll.read')
  const where: Prisma.PayrollRunWhereInput = { tenantId: ctx.tenantId, ...(ctx.branchIds ? { branchId: { in: ctx.branchIds } } : {}) }
  const [rows, total, branches] = await Promise.all([
    prisma.payrollRun.findMany({ where, orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { createdAt: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.payrollRun.count({ where }),
    prisma.branch.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true } })
  ])
  const names = new Map(branches.map(b => [b.id, b.name]))
  return { items: rows.map(r => toRunView(r, r.branchId ? names.get(r.branchId) : null)), meta: listMeta(query.page, query.limit, total), featureAvailable: await can(ctx.tenantId, 'payroll') }
}

async function loadRun(event: H3Event, id: string, ability: 'payroll.read' | 'payroll.write') {
  const ctx = await requireTenantAbility(event, ability)
  const run = await prisma.payrollRun.findFirst({ where: { id, tenantId: ctx.tenantId } })
  if (!run) throw notFound('Run payroll tidak ditemukan.')
  if (ctx.branchIds && (!run.branchId || !ctx.branchIds.includes(run.branchId))) throw notFound('Run payroll tidak ditemukan.')
  return { ctx, run }
}

export async function createPayrollRun(event: H3Event, input: z.infer<typeof runCreateSchema>) {
  const ctx = await requireTenantAbility(event, 'payroll.write')
  await requireEntitlement(event, 'payroll')
  if (input.branchId) await requireBranchAccess(event, input.branchId)
  else if (ctx.branchIds) throw httpError(400, 'VALIDATION_FAILED', 'Pilih kantor dalam cakupan Anda.', { field: 'branchId' })
  const { start, end } = periodKeys(input.periodYear, input.periodMonth)
  const today = todayKey(ctx.tenant.timezone)
  if (input.periodYear * 12 + input.periodMonth > Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) + 1) {
    throw httpError(400, 'VALIDATION_FAILED', 'Periode terlalu jauh di masa depan.', { field: 'periodMonth' })
  }
  // Run "semua kantor" dan run per kantor pada periode yang sama tidak boleh tumpang tindih.
  const clash = await prisma.payrollRun.findFirst({
    where: { tenantId: ctx.tenantId, periodYear: input.periodYear, periodMonth: input.periodMonth, status: { not: 'void' }, ...(input.branchId ? { OR: [{ branchId: null }, { branchId: input.branchId }] } : {}) }
  })
  if (clash) throw conflict(`Sudah ada run ${clash.code} untuk periode ini. Batalkan (void) dulu bila ingin menghitung ulang dari awal.`)
  await ensureSalaryComponents(ctx.tenantId)
  const period = `${input.periodYear}${String(input.periodMonth).padStart(2, '0')}`
  const seq = await nextSequence(prisma, ctx.tenantId, 'PR', period)
  const draft = { tenantId: ctx.tenantId, branchId: input.branchId ?? null, periodStart: dateKeyToDb(start), periodEnd: dateKeyToDb(end) }
  const employeeCount = await prisma.employee.count({ where: eligibleWhere(draft) })
  const lastVoid = await prisma.payrollRun.findFirst({ where: { tenantId: ctx.tenantId, periodYear: input.periodYear, periodMonth: input.periodMonth, branchId: input.branchId ?? null, status: 'void' }, orderBy: { voidedAt: 'desc' } })
  const run = await prisma.payrollRun.create({
    data: { ...draft, code: `PR-${period}-${String(seq).padStart(2, '0')}`, periodYear: input.periodYear, periodMonth: input.periodMonth, includeThr: input.includeThr ?? false, employeeCount, note: input.note ?? null, createdById: ctx.user.id, replacesRunId: lastVoid?.id ?? null }
  }).catch((e) => {
    if ((e as { code?: string }).code === 'P2002') throw conflict('Sudah ada run aktif untuk periode ini.')
    throw e
  })
  await audit(event, ctx, 'payroll_run.create', 'payroll_run', run.id, { period: `${input.periodYear}-${input.periodMonth}` })
  return toRunView(run)
}

// ---------------------------------------------------------------------------
// Perhitungan
// ---------------------------------------------------------------------------

interface CalcContext {
  run: PayrollRun
  ref: Awaited<ReturnType<typeof getPayrollReference>>
  jkkRate: number
  workDaysPerWeek: 5 | 6
  components: Map<string, SalaryComponent>
  startKey: string
  endKey: string
}

interface PayslipCalc {
  data: PayslipData & { sources: { overtimeIds: string[], reimbursementIds: string[] } }
  employerCost: number
}

const round = (n: number) => Math.round(n)

/** Hitung satu slip. Semua input sudah dimuat (batch) oleh pemanggil. */
export function computePayslip(c: CalcContext, employee: Employee, input: {
  salary: SalaryData | null
  attendance: PayslipData['attendance']
  unpaidLeaveDays: number
  overtime: Array<{ id: string, minutes: number, dayType: string }>
  reimbursements: Array<{ id: string, amount: number, category: string }>
  previous: Array<{ taxableGross: number, pph21: number, employeePension: number }>
}): PayslipCalc {
  const notes: string[] = []
  const status: PtkpStatus = isPtkpStatus(employee.ptkpStatus) ? employee.ptkpStatus : 'TK0'
  const salary = input.salary ?? { baseSalary: 0, items: [] }
  if (!input.salary) notes.push('Gaji pokok belum diatur untuk periode ini.')

  // Proporsional untuk yang masuk/berhenti di tengah periode (hari kalender).
  const days = dateKeysBetween(c.startKey, c.endKey).length
  const from = dbDateToKey(employee.joinDate) > c.startKey ? dbDateToKey(employee.joinDate) : c.startKey
  const to = employee.endDate && dbDateToKey(employee.endDate) < c.endKey ? dbDateToKey(employee.endDate) : c.endKey
  const employedDays = to >= from ? dateKeysBetween(from, to).length : 0
  const factor = days ? employedDays / days : 0
  if (factor < 1) notes.push(`Dihitung proporsional ${employedDays}/${days} hari.`)

  const earnings: PayslipLine[] = []
  const deductions: PayslipLine[] = []
  const base = round(salary.baseSalary * factor)
  earnings.push({ code: 'BASIC', name: 'Gaji pokok', amount: base, taxable: true })
  let bpjsWage = salary.baseSalary // dasar upah BPJS = upah sebulan penuh (pokok + tunjangan tetap)
  let thrWage = salary.baseSalary
  for (const item of salary.items) {
    const comp = c.components.get(item.componentId)
    if (!comp || !comp.isActive) continue
    const amount = round(item.amount * factor)
    if (comp.kind === 'earning') {
      earnings.push({ code: comp.code, name: comp.name, amount, taxable: comp.taxable })
      if (comp.bpjsBase) bpjsWage += item.amount
      if (comp.thrBase) thrWage += item.amount
    } else {
      deductions.push({ code: comp.code, name: comp.name, amount })
    }
  }

  // Cuti tanpa upah: potong per hari kerja terjadwal.
  if (input.unpaidLeaveDays > 0 && input.attendance.scheduledDays > 0) {
    deductions.push({ code: 'UNPAID_LEAVE', name: `Cuti tanpa upah (${input.unpaidLeaveDays} hari)`, amount: round((base / input.attendance.scheduledDays) * input.unpaidLeaveDays) })
  }

  // Lembur: 1/173 × upah sebulan (pokok + tunjangan tetap).
  const overtimeMinutes = input.overtime.reduce((s, o) => s + o.minutes, 0)
  const overtimeAmount = input.overtime.reduce((s, o) => s + overtimePay(o.minutes, o.dayType as OvertimeDayType, bpjsWage, c.workDaysPerWeek), 0)
  if (overtimeAmount > 0) earnings.push({ code: 'OVERTIME', name: `Upah lembur (${Math.round(overtimeMinutes / 6) / 10} jam)`, amount: overtimeAmount, taxable: true })

  if (c.run.includeThr) {
    const thr = thrAmount(thrWage, dbDateToKey(employee.joinDate), c.endKey)
    if (thr.amount > 0) earnings.push({ code: 'THR', name: thr.months >= 12 ? 'THR keagamaan' : `THR keagamaan (proporsional ${thr.months}/12)`, amount: thr.amount, taxable: true })
  }

  const reimbursementTotal = input.reimbursements.reduce((s, r) => s + r.amount, 0)
  if (reimbursementTotal > 0) earnings.push({ code: 'REIMBURSEMENT', name: `Reimbursement (${input.reimbursements.length})`, amount: round(reimbursementTotal), taxable: false })

  // BPJS
  const bpjs = bpjsContributions({ wage: bpjsWage * factor, kesehatanEnrolled: employee.bpjsKesehatanEnrolled, ketenagakerjaanEnrolled: employee.bpjsKetenagakerjaanEnrolled, pensionEnrolled: employee.pensionEnrolled, jkkRate: c.jkkRate }, c.ref.bpjs)
  const employer: PayslipLine[] = [
    { code: 'BPJS_KES_CO', name: 'BPJS Kesehatan (perusahaan)', amount: bpjs.kesehatanCompany },
    { code: 'JHT_CO', name: 'JHT (perusahaan)', amount: bpjs.jhtCompany },
    { code: 'JP_CO', name: 'Jaminan Pensiun (perusahaan)', amount: bpjs.jpCompany },
    { code: 'JKK', name: 'JKK', amount: bpjs.jkk },
    { code: 'JKM', name: 'JKM', amount: bpjs.jkm }
  ].filter(l => l.amount > 0)
  for (const [code, name, amount] of [['BPJS_KES', 'BPJS Kesehatan (1%)', bpjs.kesehatanEmployee], ['JHT', 'JHT (2%)', bpjs.jhtEmployee], ['JP', 'Jaminan Pensiun (1%)', bpjs.jpEmployee]] as const) {
    if (amount > 0) deductions.push({ code, name, amount })
  }
  const employeePension = bpjs.jhtEmployee + bpjs.jpEmployee

  // PPh 21: bruto = penghasilan kena pajak + premi JKK, JKM, BPJS Kesehatan yang dibayar perusahaan.
  const taxableEarnings = earnings.filter(e => e.taxable).reduce((s, e) => s + e.amount, 0)
  const baseTaxableGross = taxableEarnings + bpjs.kesehatanCompany + bpjs.jkk + bpjs.jkm
  const month = c.run.periodMonth
  const leaving = !!employee.endDate && dbDateToKey(employee.endDate) <= c.endKey
  const finalPeriod = month === 12 || leaving
  const method: PayslipData['pph21Method'] = finalPeriod ? 'final_period' : 'ter'
  const taxMethod: TaxMethod = employee.taxMethod === 'gross_up' ? 'gross_up' : 'gross'
  // PPh 21 untuk bruto tertentu (TER bulanan, atau Pasal 17 setahun di masa terakhir).
  const taxOn = (taxableGross: number) => {
    if (!finalPeriod) return { tax: monthlyTerTax(taxableGross, status, c.ref).tax, annual: null }
    const result = finalPeriodTax({
      annualGross: input.previous.reduce((s, p) => s + p.taxableGross, 0) + taxableGross,
      annualEmployeePension: input.previous.reduce((s, p) => s + p.employeePension, 0) + employeePension,
      monthsWorked: input.previous.length + 1,
      taxWithheldBefore: input.previous.reduce((s, p) => s + p.pph21, 0),
      status
    }, c.ref)
    return { tax: result.tax, annual: result }
  }
  // Gross-up: tunjangan PPh 21 (kena pajak) sebesar pajaknya sendiri.
  const taxAllowance = taxMethod === 'gross_up' ? grossUpAllowance(t => taxOn(baseTaxableGross + t).tax).allowance : 0
  if (taxAllowance > 0) earnings.push({ code: 'TAX_ALLOWANCE', name: 'Tunjangan PPh 21 (gross-up)', amount: taxAllowance, taxable: true })
  const taxableGross = baseTaxableGross + taxAllowance
  const ter = monthlyTerTax(taxableGross, status, c.ref)
  const taxed = taxOn(taxableGross)
  const pph21 = taxed.tax
  if (taxed.annual) notes.push(`PPh 21 masa terakhir: PKP setahun ${formatIDR(taxed.annual.taxableIncome)}, pajak setahun ${formatIDR(taxed.annual.annualTax)}.`)
  if (taxMethod === 'gross_up') notes.push('Metode gross-up: PPh 21 ditanggung perusahaan melalui tunjangan PPh 21.')
  if (pph21 > 0) deductions.push({ code: 'PPH21', name: 'PPh 21', amount: pph21 })
  else if (pph21 < 0) earnings.push({ code: 'PPH21_REFUND', name: 'Kelebihan potong PPh 21', amount: -pph21, taxable: false })

  const gross = earnings.reduce((s, e) => s + e.amount, 0)
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0)
  const employerCost = gross + employer.reduce((s, l) => s + l.amount, 0)
  return {
    employerCost,
    data: {
      period: { year: c.run.periodYear, month },
      ptkpStatus: status,
      baseSalary: salary.baseSalary,
      earnings, deductions, employer,
      gross, totalDeductions, net: gross - totalDeductions,
      taxableGross, pph21, pph21Method: method, taxMethod, terCategory: terCategory(status), terRate: ter.rate, employeePension,
      attendance: input.attendance,
      overtimeMinutes,
      notes,
      sources: { overtimeIds: input.overtime.map(o => o.id), reimbursementIds: input.reimbursements.map(r => r.id) }
    }
  }
}

export const calculateSchema = z.object({ restart: z.boolean().optional() })

/** Hitung satu potongan karyawan. Klien memanggil berulang sampai `done`. */
export async function calculatePayrollChunk(event: H3Event, id: string, input: z.infer<typeof calculateSchema>) {
  const { ctx, run } = await loadRun(event, id, 'payroll.write')
  await requireEntitlement(event, 'payroll')
  if (run.status !== 'draft') throw conflict('Hanya run berstatus draf yang bisa dihitung. Void lalu buat run baru untuk mengubah run yang disetujui.')
  const { start, end } = { start: dbDateToKey(run.periodStart), end: dbDateToKey(run.periodEnd) }
  const eligible = await prisma.employee.findMany({ where: eligibleWhere(run), orderBy: { id: 'asc' }, select: { id: true } })
  const eligibleIds = eligible.map(e => e.id)

  // Mulai ulang (atau hitung ulang run yang sudah selesai): buang slip karyawan yang tidak eligible lagi
  // & reset penunjuk. Penunjuk = calculatedCount atas daftar karyawan berurutan id (stabil).
  let offset = run.calculatedCount
  if (input.restart || run.calculatedAt || offset > eligibleIds.length) {
    await prisma.payslip.deleteMany({ where: { runId: run.id, employeeId: { notIn: eligibleIds } } })
    offset = 0
  }
  const batchIds = eligibleIds.slice(offset, offset + CHUNK)
  const employees = await prisma.employee.findMany({ where: { id: { in: batchIds } }, include: { department: { select: { name: true } }, position: { select: { name: true } }, branch: { select: { timezone: true } } } })
  const ref = await getPayrollReference(end)
  const settings = await getHrSettings(ctx.tenantId)
  const components = await ensureSalaryComponents(ctx.tenantId)
  const defaultShift = await ensureDefaultShift(ctx.tenantId)
  const calc: CalcContext = {
    run, ref, jkkRate: Number(settings.bpjsJkkRatePercent), workDaysPerWeek: defaultShift.workingDays.length >= 6 ? 6 : 5,
    components: new Map(components.map(c => [c.id, c])), startKey: start, endKey: end
  }
  const ids = employees.map(e => e.id)
  // Resolver jadwal punya query paralelnya sendiri -> dijalankan terpisah (<= ~6 query paralel per request).
  const resolve = await buildScheduleResolver(ctx.tenantId, employees, start, end)
  const [records, leaves, overtime, reimbursements, previousSlips] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, workDate: { gte: run.periodStart, lte: run.periodEnd } } }),
    prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: 'approved', startDate: { lte: run.periodEnd }, endDate: { gte: run.periodStart } }, include: { leaveType: { select: { isPaid: true, name: true } } } }),
    prisma.overtimeRequest.findMany({ where: { employeeId: { in: ids }, status: 'approved', workDate: { gte: run.periodStart, lte: run.periodEnd }, OR: [{ payrollRunId: null }, { payrollRunId: run.id }] } }),
    prisma.reimbursement.findMany({ where: { employeeId: { in: ids }, status: 'approved', expenseDate: { lte: run.periodEnd }, OR: [{ payrollRunId: null }, { payrollRunId: run.id }] } }),
    run.periodMonth > 1
      ? prisma.payslip.findMany({ where: { employeeId: { in: ids }, run: { tenantId: ctx.tenantId, periodYear: run.periodYear, periodMonth: { lt: run.periodMonth }, status: { in: ['approved', 'paid_recorded'] } } }, select: { employeeId: true, dataEncrypted: true } })
      : Promise.resolve([] as Array<{ employeeId: string, dataEncrypted: string }>)
  ])
  const now = new Date()
  for (const employee of employees) {
    const salary = await salaryOn(employee.id, end)
    const days = dateKeysBetween(start, end)
    const empRecords = new Map(records.filter(r => r.employeeId === employee.id).map(r => [dbDateToKey(r.workDate), r]))
    const empLeaves = leaves.filter(l => l.employeeId === employee.id)
    const leaveDay = new Map<string, boolean>()
    for (const l of empLeaves) for (const k of dateKeysBetween(dbDateToKey(l.startDate), dbDateToKey(l.endDate))) leaveDay.set(k, l.leaveType.isPaid)
    const dayRows = days.map((k) => {
      const schedule = resolve(employee, k)
      const record = empRecords.get(k)
      const leave = leaveDay.has(k) ? 'leave' : null
      return { schedule, record: record ? { lateMinutes: record.lateMinutes, workedMinutes: record.workedMinutes } : null, status: dayStatus(schedule, record, leave, k, todayKey(employee.branch.timezone), now, employee.branch.timezone) }
    })
    const summary = summarizeDays(dayRows)
    const unpaidLeaveDays = days.filter((k, i) => leaveDay.get(k) === false && dayRows[i]!.schedule.kind === 'work').length
    const result = computePayslip(calc, employee, {
      salary,
      attendance: { scheduledDays: summary.scheduledDays, presentDays: summary.presentDays, lateDays: summary.lateDays, absentDays: summary.absentDays, leaveDays: summary.leaveDays },
      unpaidLeaveDays,
      overtime: overtime.filter(o => o.employeeId === employee.id).map(o => ({ id: o.id, minutes: o.minutes, dayType: o.dayType })),
      reimbursements: reimbursements.filter(r => r.employeeId === employee.id).map(r => ({ id: r.id, amount: Number(r.approvedAmount ?? r.amount), category: r.category })),
      previous: previousSlips.filter(p => p.employeeId === employee.id).map(p => decryptHrJson<PayslipData | null>(p.dataEncrypted, null)).filter((p): p is PayslipData => !!p).map(p => ({ taxableGross: p.taxableGross, pph21: p.pph21, employeePension: p.employeePension }))
    })
    const existing = await prisma.payslip.findUnique({ where: { runId_employeeId: { runId: run.id, employeeId: employee.id } }, select: { id: true } })
    const snapshot = { employeeName: employee.fullName, employeeNumber: employee.employeeNumber, branchId: employee.branchId, departmentName: employee.department?.name ?? null, positionName: employee.position?.name ?? null, dataEncrypted: encryptHrJson(result.data), calculatedAt: new Date() }
    if (existing) {
      await prisma.payslip.update({ where: { id: existing.id }, data: snapshot })
    } else {
      const n = await nextSequence(prisma, ctx.tenantId, 'SL', `${run.periodYear}${String(run.periodMonth).padStart(2, '0')}`)
      await prisma.payslip.create({ data: { ...snapshot, tenantId: ctx.tenantId, runId: run.id, employeeId: employee.id, code: `SL-${run.periodYear}${String(run.periodMonth).padStart(2, '0')}-${String(n).padStart(4, '0')}` } })
    }
  }
  const calculatedCount = Math.min(eligibleIds.length, offset + batchIds.length)
  const done = calculatedCount >= eligibleIds.length
  if (done) {
    const totals = await runTotals(run.id)
    await prisma.payrollRun.update({ where: { id: run.id }, data: { ...totals, calculatedCount, employeeCount: eligibleIds.length, calculatedAt: new Date() } })
    await audit(event, ctx, 'payroll_run.calculate', 'payroll_run', run.id, { employees: eligibleIds.length })
  } else {
    await prisma.payrollRun.update({ where: { id: run.id }, data: { calculatedCount, employeeCount: eligibleIds.length, calculatedAt: null } })
  }
  return { done, processed: batchIds.length, calculated: calculatedCount, total: eligibleIds.length }
}

async function runTotals(runId: string) {
  const slips = await prisma.payslip.findMany({ where: { runId }, select: { dataEncrypted: true } })
  let totalGross = 0
  let totalDeductions = 0
  let totalNet = 0
  let totalPph21 = 0
  let totalEmployerCost = 0
  for (const s of slips) {
    const d = decryptHrJson<PayslipData | null>(s.dataEncrypted, null)
    if (!d) continue
    totalGross += d.gross
    totalDeductions += d.totalDeductions
    totalNet += d.net
    totalPph21 += d.pph21
    totalEmployerCost += d.gross + d.employer.reduce((sum, l) => sum + l.amount, 0)
  }
  return { totalGross, totalDeductions, totalNet, totalPph21, totalEmployerCost }
}

// ---------------------------------------------------------------------------
// Detail, persetujuan, pembayaran tercatat, void
// ---------------------------------------------------------------------------

export async function getPayrollRun(event: H3Event, id: string) {
  const { ctx, run } = await loadRun(event, id, 'payroll.read')
  await assertSensitiveReadAllowed(event, { fieldGroup: 'salary', targetType: 'payroll_run', targetId: run.id })
  const [slips, branch] = await Promise.all([
    prisma.payslip.findMany({ where: { runId: run.id }, orderBy: { employeeName: 'asc' } }),
    run.branchId ? prisma.branch.findUnique({ where: { id: run.branchId }, select: { name: true } }) : null
  ])
  await audit(event, ctx, 'salary.read', 'payroll_run', run.id, { fieldGroup: 'payroll_run', payslips: slips.length })
  return {
    run: toRunView(run, branch?.name),
    payslips: slips.map((s) => {
      const d = decryptHrJson<PayslipData | null>(s.dataEncrypted, null)
      return { id: s.id, code: s.code, employeeId: s.employeeId, employeeName: s.employeeName, employeeNumber: s.employeeNumber, departmentName: s.departmentName, positionName: s.positionName, gross: d?.gross ?? 0, totalDeductions: d?.totalDeductions ?? 0, net: d?.net ?? 0, pph21: d?.pph21 ?? 0, notes: d?.notes ?? [], viewedAt: s.viewedAt?.toISOString() ?? null }
    })
  }
}

export async function approvePayrollRun(event: H3Event, id: string) {
  const { ctx, run } = await loadRun(event, id, 'payroll.write')
  await requireNotImpersonating(event)
  if (ctx.role !== 'owner' && ctx.role !== 'hr_admin') throw forbidden()
  if (run.status !== 'draft') throw conflict('Run ini bukan draf.')
  if (!run.calculatedAt || run.calculatedCount !== run.employeeCount) throw conflict('Hitung run sampai selesai sebelum menyetujui.')
  // Data berubah setelah dihitung? Karyawan eligible harus sama dengan slip yang ada.
  const eligible = await prisma.employee.count({ where: eligibleWhere(run) })
  const slips = await prisma.payslip.findMany({ where: { runId: run.id }, select: { dataEncrypted: true } })
  if (eligible !== slips.length) throw conflict('Daftar karyawan berubah sejak dihitung. Hitung ulang sebelum menyetujui.')
  const sources = slips.map(s => decryptHrJson<{ sources?: { overtimeIds: string[], reimbursementIds: string[] } } | null>(s.dataEncrypted, null)?.sources).filter(Boolean)
  const overtimeIds = sources.flatMap(s => s!.overtimeIds)
  const reimbursementIds = sources.flatMap(s => s!.reimbursementIds)
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.payrollRun.updateMany({ where: { id: run.id, status: 'draft' }, data: { status: 'approved', approvedAt: new Date(), approvedById: ctx.user.id } })
    if (claimed.count !== 1) throw conflict('Run ini baru saja diubah. Muat ulang halaman.')
    if (overtimeIds.length) await tx.overtimeRequest.updateMany({ where: { id: { in: overtimeIds }, payrollRunId: null }, data: { payrollRunId: run.id } })
    if (reimbursementIds.length) await tx.reimbursement.updateMany({ where: { id: { in: reimbursementIds }, payrollRunId: null }, data: { payrollRunId: run.id } })
  })
  await audit(event, ctx, 'payroll_run.approve', 'payroll_run', run.id)
  if ((await getHrSettings(ctx.tenantId)).payslipVisibleOnApproval) await publishPayslips(run)
  return { success: true }
}

export const markPaidSchema = z.object({ paidDate: dateKeySchema })

export async function markPayrollPaid(event: H3Event, id: string, input: z.infer<typeof markPaidSchema>) {
  const { ctx, run } = await loadRun(event, id, 'payroll.write')
  await requireNotImpersonating(event)
  if (run.status !== 'approved') throw conflict('Hanya run yang disetujui yang bisa ditandai sudah dibayar.')
  await prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'paid_recorded', paidRecordedAt: new Date(), paidRecordedById: ctx.user.id, paidDate: dateKeyToDb(input.paidDate) } })
  await audit(event, ctx, 'payroll_run.mark_paid', 'payroll_run', run.id, { paidDate: input.paidDate })
  if (!(await getHrSettings(ctx.tenantId)).payslipVisibleOnApproval) await publishPayslips(run)
  return { success: true }
}

export const voidSchema = z.object({ reason: z.string().trim().min(5, 'Tuliskan alasan pembatalan (minimal 5 karakter).').max(300) })

export async function voidPayrollRun(event: H3Event, id: string, input: z.infer<typeof voidSchema>) {
  const { ctx, run } = await loadRun(event, id, 'payroll.write')
  await requireNotImpersonating(event)
  if (run.status === 'void') throw conflict('Run ini sudah dibatalkan.')
  if (run.status !== 'draft' && ctx.role !== 'owner' && ctx.role !== 'hr_admin') throw forbidden()
  // Run periode berikutnya yang sudah disetujui memakai PPh run ini → harus di-void lebih dulu (Desember).
  await prisma.$transaction(async (tx) => {
    await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'void', voidedAt: new Date(), voidedById: ctx.user.id, voidReason: input.reason } })
    await tx.overtimeRequest.updateMany({ where: { payrollRunId: run.id }, data: { payrollRunId: null } })
    await tx.reimbursement.updateMany({ where: { payrollRunId: run.id }, data: { payrollRunId: null } })
  })
  await audit(event, ctx, 'payroll_run.void', 'payroll_run', run.id, { reason: input.reason, previousStatus: run.status })
  return { success: true }
}

async function publishPayslips(run: PayrollRun) {
  const slips = await prisma.payslip.findMany({ where: { runId: run.id }, select: { employee: { select: { tenantUserId: true, fullName: true } } } })
  for (const s of slips) {
    if (!s.employee.tenantUserId) continue
    await safeCreateNotification({ audience: 'tenant', tenantId: run.tenantId, tenantUserId: s.employee.tenantUserId, templateKey: 'payslip_published', variables: { name: s.employee.fullName, periodLabel: periodLabel(run.periodYear, run.periodMonth), payslipUrl: '/app/me/payslips' } })
  }
}

// ---------------------------------------------------------------------------
// Slip gaji
// ---------------------------------------------------------------------------

async function payslipDetail(slipId: string, tenantId: string) {
  const slip = await prisma.payslip.findFirst({ where: { id: slipId, tenantId }, include: { run: true } })
  if (!slip) throw notFound('Slip gaji tidak ditemukan.')
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, legalName: true, logoUrl: true } })
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: slip.employeeId }, select: { bankName: true, bankAccountNumberEncrypted: true, bankAccountName: true, npwpEncrypted: true, joinDate: true } })
  const data = decryptHrJson<PayslipData | null>(slip.dataEncrypted, null)
  const { sources: _sources, ...publicData } = (data ?? {}) as PayslipData & { sources?: unknown }
  return {
    id: slip.id, code: slip.code, runId: slip.runId, runStatus: slip.run.status, periodLabel: periodLabel(slip.run.periodYear, slip.run.periodMonth),
    company: { name: tenant.legalName || tenant.name, logoUrl: tenant.logoUrl },
    employee: { id: slip.employeeId, name: slip.employeeName, number: slip.employeeNumber, department: slip.departmentName, position: slip.positionName, joinDate: dbDateToKey(employee.joinDate), npwp: maskIdentifier(decryptHr(employee.npwpEncrypted)) || null, bank: employee.bankName ? `${employee.bankName} ${maskIdentifier(decryptHr(employee.bankAccountNumberEncrypted))}` : null },
    paidDate: slip.run.paidDate ? dbDateToKey(slip.run.paidDate) : null,
    data: data ? publicData : null
  }
}

export async function getPayslip(event: H3Event, id: string) {
  const ctx = await requireTenantAbility(event, 'payroll.read')
  const slip = await prisma.payslip.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { employeeId: true } })
  if (!slip) throw notFound('Slip gaji tidak ditemukan.')
  await requireEmployeeAccess(event, 'payroll.read', slip.employeeId)
  await auditSensitiveRead(event, ctx, { employeeId: slip.employeeId, fieldGroup: 'payslip' })
  return payslipDetail(id, ctx.tenantId)
}

async function visibleRunStatuses(tenantId: string): Promise<Array<'approved' | 'paid_recorded'>> {
  return (await getHrSettings(tenantId)).payslipVisibleOnApproval ? ['approved', 'paid_recorded'] : ['paid_recorded']
}

export async function myPayslips(event: H3Event) {
  const { ctx, employee } = await requireOwnEmployee(event, 'payslips.read.own')
  const slips = await prisma.payslip.findMany({
    where: { employeeId: employee.id, run: { status: { in: await visibleRunStatuses(ctx.tenantId) } } },
    include: { run: { select: { periodYear: true, periodMonth: true, paidDate: true, status: true } } },
    orderBy: [{ run: { periodYear: 'desc' } }, { run: { periodMonth: 'desc' } }],
    take: 36
  })
  return {
    items: slips.map((s) => {
      const d = decryptHrJson<PayslipData | null>(s.dataEncrypted, null)
      return { id: s.id, code: s.code, periodLabel: periodLabel(s.run.periodYear, s.run.periodMonth), periodYear: s.run.periodYear, periodMonth: s.run.periodMonth, net: d?.net ?? 0, paidDate: s.run.paidDate ? dbDateToKey(s.run.paidDate) : null, status: s.run.status, viewed: !!s.viewedAt }
    })
  }
}

export async function myPayslip(event: H3Event, id: string) {
  const { ctx, employee } = await requireOwnEmployee(event, 'payslips.read.own')
  const slip = await prisma.payslip.findFirst({ where: { id, employeeId: employee.id, run: { status: { in: await visibleRunStatuses(ctx.tenantId) } } } })
  if (!slip) throw notFound('Slip gaji tidak ditemukan.')
  if (!slip.viewedAt) await prisma.payslip.update({ where: { id }, data: { viewedAt: new Date() } })
  return payslipDetail(id, ctx.tenantId)
}

// ---------------------------------------------------------------------------
// Ekspor (fitur export): rekap & daftar transfer bank (transfer tetap dilakukan perusahaan)
// ---------------------------------------------------------------------------

export async function exportPayrollRun(event: H3Event, id: string, kind: 'summary' | 'bank') {
  const { ctx, run } = await loadRun(event, id, 'payroll.read')
  await requireEntitlement(event, 'export')
  if (kind === 'bank' && !canTenantRole(ctx.role, 'employees.sensitive.read')) throw forbidden()
  await assertSensitiveReadAllowed(event, { fieldGroup: kind === 'bank' ? 'bank' : 'salary', targetType: 'payroll_run', targetId: run.id })
  const slips = await prisma.payslip.findMany({ where: { runId: run.id }, orderBy: { employeeName: 'asc' } })
  await audit(event, ctx, 'payroll_run.export', 'payroll_run', run.id, { kind })
  if (kind === 'bank') {
    const employees = new Map((await prisma.employee.findMany({ where: { id: { in: slips.map(s => s.employeeId) } }, select: { id: true, bankName: true, bankAccountNumberEncrypted: true, bankAccountName: true } })).map(e => [e.id, e]))
    return toCsv(['NIP', 'Nama', 'Bank', 'No rekening', 'Nama rekening', 'Gaji bersih'], slips.map((s) => {
      const e = employees.get(s.employeeId)
      const d = decryptHrJson<PayslipData | null>(s.dataEncrypted, null)
      return [s.employeeNumber, s.employeeName, e?.bankName, decryptHr(e?.bankAccountNumberEncrypted), e?.bankAccountName, d?.net ?? 0]
    }))
  }
  return toCsv(
    ['NIP', 'Nama', 'Departemen', 'Jabatan', 'PTKP', 'Gaji pokok', 'Total pendapatan', 'Bruto PPh 21', 'PPh 21', 'BPJS karyawan', 'BPJS perusahaan', 'Total potongan', 'Gaji bersih'],
    slips.map((s) => {
      const d = decryptHrJson<PayslipData | null>(s.dataEncrypted, null)
      const bpjsEmployee = (d?.deductions ?? []).filter(l => ['BPJS_KES', 'JHT', 'JP'].includes(l.code)).reduce((sum, l) => sum + l.amount, 0)
      const bpjsCompany = (d?.employer ?? []).reduce((sum, l) => sum + l.amount, 0)
      return [s.employeeNumber, s.employeeName, s.departmentName, s.positionName, d?.ptkpStatus, d?.baseSalary, d?.gross, d?.taxableGross, d?.pph21, bpjsEmployee, bpjsCompany, d?.totalDeductions, d?.net]
    })
  )
}
