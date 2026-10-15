import type { H3Event } from 'h3'
import { z } from 'zod'
import type { WorkCalendar } from '#shared/utils/identifiers'
import { dateKeyToDb, dateKeysBetween, dbDateToKey, weekdayOfKey, zonedInstant, addDaysToKey } from '#shared/utils/timezone'
import type { Employee, Shift } from '~~/generated/prisma/client'

// 11.4 Shift & jadwal. Jadwal harian (ShiftAssignment) adalah fitur shiftScheduling; tanpa fitur itu
// setiap karyawan memakai shift bawaannya (atau shift default perusahaan) dengan pola hari kerjanya.

export interface DaySchedule {
  date: string
  kind: 'work' | 'off' | 'holiday'
  shiftId: string | null
  shiftName: string | null
  startTime: string | null
  endTime: string | null
  breakMinutes: number
  lateToleranceMinutes: number
  holidayName: string | null
}

export function scheduledInstants(schedule: DaySchedule, tz: string): { start: Date, end: Date } | null {
  if (schedule.kind !== 'work' || !schedule.startTime || !schedule.endTime) return null
  const start = zonedInstant(schedule.date, schedule.startTime, tz)
  const endKey = schedule.endTime <= schedule.startTime ? addDaysToKey(schedule.date, 1) : schedule.date
  return { start, end: zonedInstant(endKey, schedule.endTime, tz) }
}

/** Shift default perusahaan; dibuat dari kalender kerja onboarding bila belum ada. */
export async function ensureDefaultShift(tenantId: string): Promise<Shift> {
  const existing = await prisma.shift.findFirst({ where: { tenantId, isDefault: true, isActive: true } })
  if (existing) return existing
  const any = await prisma.shift.findFirst({ where: { tenantId, isActive: true }, orderBy: { createdAt: 'asc' } })
  if (any) return prisma.shift.update({ where: { id: any.id }, data: { isDefault: true } })
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { workCalendar: true } })
  const cal = (tenant?.workCalendar ?? null) as WorkCalendar | null
  return prisma.shift.create({
    data: {
      tenantId, name: 'Jam kerja normal', code: 'NORMAL',
      startTime: cal?.startTime ?? '08:00', endTime: cal?.endTime ?? '17:00', breakMinutes: cal?.breakMinutes ?? 60,
      lateToleranceMinutes: 0, workingDays: cal?.workingDays?.length ? cal.workingDays : [1, 2, 3, 4, 5], isDefault: true
    }
  })
}

type ScheduleEmployee = Pick<Employee, 'id' | 'branchId' | 'shiftId'>

/** Jadwal banyak karyawan × rentang tanggal, dengan jumlah query tetap. */
export async function buildScheduleResolver(tenantId: string, employees: ScheduleEmployee[], fromKey: string, toKey: string) {
  const defaultShift = await ensureDefaultShift(tenantId)
  const [shifts, scheduling, assignments, holidays] = await Promise.all([
    prisma.shift.findMany({ where: { tenantId } }),
    can(tenantId, 'shiftScheduling'),
    prisma.shiftAssignment.findMany({ where: { tenantId, employeeId: { in: employees.map(e => e.id) }, date: { gte: dateKeyToDb(fromKey), lte: dateKeyToDb(toKey) } } }),
    prisma.holiday.findMany({ where: { tenantId, date: { gte: dateKeyToDb(fromKey), lte: dateKeyToDb(toKey) } } })
  ])
  const shiftById = new Map(shifts.map(s => [s.id, s]))
  const assignmentKey = new Map(scheduling ? assignments.map(a => [`${a.employeeId}:${dbDateToKey(a.date)}`, a.shiftId]) : [])
  const holidayFor = (branchId: string, key: string) => holidays.find(h => dbDateToKey(h.date) === key && (!h.branchId || h.branchId === branchId))

  return (employee: ScheduleEmployee, key: string): DaySchedule => {
    const base = { date: key, breakMinutes: 0, lateToleranceMinutes: 0, holidayName: null as string | null }
    const holiday = holidayFor(employee.branchId, key)
    if (holiday) return { ...base, kind: 'holiday', shiftId: null, shiftName: null, startTime: null, endTime: null, holidayName: holiday.name }
    const assigned = assignmentKey.get(`${employee.id}:${key}`)
    let shift: Shift | undefined
    if (assigned !== undefined) {
      if (assigned === null) return { ...base, kind: 'off', shiftId: null, shiftName: null, startTime: null, endTime: null }
      shift = shiftById.get(assigned)
    } else {
      const own = employee.shiftId ? shiftById.get(employee.shiftId) : undefined
      shift = own?.isActive ? own : defaultShift
      if (!shift.workingDays.includes(weekdayOfKey(key))) return { ...base, kind: 'off', shiftId: shift.id, shiftName: shift.name, startTime: null, endTime: null }
    }
    if (!shift) return { ...base, kind: 'off', shiftId: null, shiftName: null, startTime: null, endTime: null }
    return { ...base, kind: 'work', shiftId: shift.id, shiftName: shift.name, startTime: shift.startTime, endTime: shift.endTime, breakMinutes: shift.breakMinutes, lateToleranceMinutes: shift.lateToleranceMinutes }
  }
}

// ---------------------------------------------------------------------------
// CRUD shift
// ---------------------------------------------------------------------------

export const shiftSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(60),
  code: z.string().trim().max(20).nullable().optional(),
  startTime: timeSchema,
  endTime: timeSchema,
  breakMinutes: z.number().int().min(0).max(240),
  lateToleranceMinutes: z.number().int().min(0).max(120),
  workingDays: z.array(z.number().int().min(0).max(6)).max(7),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional()
})

function toShiftView(s: Shift & { _count?: { employees: number } }) {
  return { id: s.id, name: s.name, code: s.code, startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes, lateToleranceMinutes: s.lateToleranceMinutes, workingDays: s.workingDays, isDefault: s.isDefault, isActive: s.isActive, employeeCount: s._count?.employees ?? 0 }
}

export async function listShifts(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'attendance.read')
  await ensureDefaultShift(ctx.tenantId)
  const rows = await prisma.shift.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ isDefault: 'desc' }, { isActive: 'desc' }, { name: 'asc' }], include: { _count: { select: { employees: true } } } })
  return { items: rows.map(toShiftView), schedulingAvailable: await can(ctx.tenantId, 'shiftScheduling') }
}

async function audit(event: H3Event, ctx: TenantContext, action: string, targetId: string, metadata?: Record<string, unknown>) {
  await recordAudit(event, { audience: 'tenant', action, actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'shift', targetId, metadata })
}

export async function createShift(event: H3Event, input: z.infer<typeof shiftSchema>) {
  const ctx = await requireTenantAbility(event, 'attendance.write')
  // Shift kedua dan seterusnya = penjadwalan shift (fitur berbayar).
  if (await prisma.shift.count({ where: { tenantId: ctx.tenantId } }) >= 1) await requireEntitlement(event, 'shiftScheduling')
  const row = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.shift.updateMany({ where: { tenantId: ctx.tenantId }, data: { isDefault: false } })
    return tx.shift.create({ data: { tenantId: ctx.tenantId, ...input, code: input.code || null, isDefault: input.isDefault ?? false } })
  })
  await audit(event, ctx, 'shift.create', row.id)
  return toShiftView(row)
}

export async function updateShift(event: H3Event, id: string, input: Partial<z.infer<typeof shiftSchema>>) {
  const ctx = await requireTenantAbility(event, 'attendance.write')
  const shift = await prisma.shift.findFirst({ where: { id, tenantId: ctx.tenantId } })
  if (!shift) throw notFound('Shift tidak ditemukan.')
  if (shift.isDefault && input.isActive === false) throw conflict('Shift default tidak bisa dinonaktifkan. Jadikan shift lain default lebih dulu.')
  const row = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.shift.updateMany({ where: { tenantId: ctx.tenantId, id: { not: id } }, data: { isDefault: false } })
    return tx.shift.update({ where: { id }, data: { ...input, code: input.code === undefined ? undefined : (input.code || null), isDefault: input.isDefault === false && shift.isDefault ? true : input.isDefault } })
  })
  await audit(event, ctx, 'shift.update', id)
  return toShiftView(row)
}

export async function deleteShift(event: H3Event, id: string) {
  const ctx = await requireTenantAbility(event, 'attendance.write')
  const shift = await prisma.shift.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { _count: { select: { employees: true, assignments: true } } } })
  if (!shift) throw notFound('Shift tidak ditemukan.')
  if (shift.isDefault) throw conflict('Shift default tidak bisa dihapus.')
  if (shift._count.employees || shift._count.assignments) throw conflict('Shift masih dipakai karyawan atau jadwal. Nonaktifkan saja.')
  await prisma.shift.delete({ where: { id } })
  await audit(event, ctx, 'shift.delete', id)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Jadwal harian (shiftScheduling)
// ---------------------------------------------------------------------------

export const rosterQuerySchema = z.object({ from: dateKeySchema, to: dateKeySchema, branchId: z.string().optional(), search: z.string().trim().max(100).optional() })

export async function getRoster(event: H3Event, query: z.infer<typeof rosterQuerySchema>) {
  const ctx = await requireTenantAbility(event, 'attendance.read')
  if (query.to < query.from || dateKeysBetween(query.from, query.to).length > 31) throw httpError(400, 'VALIDATION_FAILED', 'Rentang jadwal maksimal 31 hari.')
  const employees = await prisma.employee.findMany({
    where: { AND: [await visibleEmployeesWhere(event, ctx), { status: { in: ['active', 'probation', 'on_leave'] } }, query.branchId ? { branchId: query.branchId } : {}, query.search ? { fullName: { contains: query.search, mode: 'insensitive' } } : {}] },
    orderBy: { fullName: 'asc' },
    take: 200,
    select: { id: true, fullName: true, employeeNumber: true, branchId: true, shiftId: true }
  })
  const resolve = await buildScheduleResolver(ctx.tenantId, employees, query.from, query.to)
  const days = dateKeysBetween(query.from, query.to)
  return {
    days,
    schedulingAvailable: await can(ctx.tenantId, 'shiftScheduling'),
    items: employees.map(e => ({ id: e.id, fullName: e.fullName, employeeNumber: e.employeeNumber, days: days.map(d => resolve(e, d)) }))
  }
}

export const assignmentSchema = z.object({
  employeeIds: z.array(z.string()).min(1).max(200),
  dates: z.array(dateKeySchema).min(1).max(31),
  /** null = libur; undefined/"default" dihapus = kembali ke pola bawaan */
  shiftId: z.string().nullable(),
  reset: z.boolean().optional()
})

export async function assignShifts(event: H3Event, input: z.infer<typeof assignmentSchema>) {
  const ctx = await requireTenantAbility(event, 'attendance.write')
  await requireEntitlement(event, 'shiftScheduling')
  if (input.shiftId && !await prisma.shift.findFirst({ where: { id: input.shiftId, tenantId: ctx.tenantId, isActive: true } })) throw notFound('Shift tidak ditemukan.')
  const allowed = await prisma.employee.findMany({ where: { AND: [await visibleEmployeesWhere(event, ctx), { id: { in: input.employeeIds } }] }, select: { id: true } })
  if (allowed.length !== new Set(input.employeeIds).size) throw notFound('Karyawan tidak ditemukan.')
  const dates = input.dates.map(dateKeyToDb)
  await prisma.$transaction(async (tx) => {
    await tx.shiftAssignment.deleteMany({ where: { tenantId: ctx.tenantId, employeeId: { in: input.employeeIds }, date: { in: dates } } })
    if (!input.reset) {
      await tx.shiftAssignment.createMany({ data: input.employeeIds.flatMap(employeeId => dates.map(date => ({ tenantId: ctx.tenantId, employeeId, date, shiftId: input.shiftId }))) })
    }
  })
  await audit(event, ctx, 'shift.assign', input.shiftId ?? 'off', { employees: input.employeeIds.length, days: input.dates.length, reset: !!input.reset })
  return { success: true }
}
