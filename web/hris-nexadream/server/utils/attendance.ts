import type { H3Event } from 'h3'
import { z } from 'zod'
import { RECORD_CODE_PREFIX } from '#shared/utils/hr'
import { addDaysToKey, dateKeyToDb, dateKeysBetween, dbDateToKey, todayKey, zonedDateKey, zonedInstant, zonedTimeLabel } from '#shared/utils/timezone'
import { formatDateId } from '#shared/utils/format'
import type { AttendanceRecord, Employee, Prisma } from '~~/generated/prisma/client'
import type { DaySchedule } from './schedules'

// 11.3 Kehadiran. Hari absen = hari lokal kantor karyawan (WIB/WITA/WIT). Riwayat tidak disunting:
// perubahan lewat koreksi (attendance_corrections.before menyimpan nilai lama).

const OPEN_RECORD_MAX_HOURS = 20

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}

/** Hitung terlambat/pulang cepat/jam kerja dari jadwal hari itu. */
export function computeMetrics(record: { clockInAt: Date | null, clockOutAt: Date | null }, schedule: DaySchedule | null, tz: string) {
  const window = schedule ? scheduledInstants(schedule, tz) : null
  let lateMinutes = 0
  let earlyLeaveMinutes = 0
  if (window && record.clockInAt) {
    const diff = Math.floor((record.clockInAt.getTime() - window.start.getTime()) / 60000)
    lateMinutes = diff > (schedule?.lateToleranceMinutes ?? 0) ? diff : 0
  }
  if (window && record.clockOutAt) earlyLeaveMinutes = Math.max(0, Math.floor((window.end.getTime() - record.clockOutAt.getTime()) / 60000))
  let workedMinutes = 0
  if (record.clockInAt && record.clockOutAt) {
    const raw = Math.max(0, Math.floor((record.clockOutAt.getTime() - record.clockInAt.getTime()) / 60000))
    // Istirahat dipotong hanya bila durasi melewati 4 jam.
    workedMinutes = raw > 240 ? Math.max(0, raw - (schedule?.breakMinutes ?? 0)) : raw
  }
  return { lateMinutes, earlyLeaveMinutes, workedMinutes, status: (lateMinutes > 0 ? 'late' : 'present') as 'late' | 'present', window }
}

function toRecordView(r: AttendanceRecord, tz: string) {
  return {
    id: r.id,
    workDate: dbDateToKey(r.workDate),
    clockInAt: r.clockInAt?.toISOString() ?? null,
    clockOutAt: r.clockOutAt?.toISOString() ?? null,
    clockInTime: r.clockInAt ? zonedTimeLabel(r.clockInAt, tz) : null,
    clockOutTime: r.clockOutAt ? zonedTimeLabel(r.clockOutAt, tz) : null,
    status: r.status,
    lateMinutes: r.lateMinutes,
    earlyLeaveMinutes: r.earlyLeaveMinutes,
    workedMinutes: r.workedMinutes,
    source: r.source,
    clockInDistanceMeters: r.clockInDistanceMeters,
    hasPhoto: !!r.clockInPhotoFileId,
    note: r.note,
    autoClosed: !!r.autoClosedAt,
    corrected: !!r.correctedAt
  }
}

async function employeeBranch(employee: Employee) {
  return prisma.branch.findUniqueOrThrow({ where: { id: employee.branchId }, select: { id: true, name: true, timezone: true, latitude: true, longitude: true, geofenceRadiusMeters: true } })
}

/** Pengajuan cuti disetujui yang mencakup tanggal-tanggal ini, per karyawan. */
export async function approvedLeaveDays(tenantId: string, employeeIds: string[], fromKey: string, toKey: string): Promise<Map<string, Map<string, string>>> {
  const rows = await prisma.leaveRequest.findMany({
    where: { tenantId, employeeId: { in: employeeIds }, status: 'approved', startDate: { lte: dateKeyToDb(toKey) }, endDate: { gte: dateKeyToDb(fromKey) } },
    select: { employeeId: true, startDate: true, endDate: true, leaveType: { select: { name: true } } }
  })
  const map = new Map<string, Map<string, string>>()
  for (const row of rows) {
    const days = map.get(row.employeeId) ?? new Map<string, string>()
    for (const key of dateKeysBetween(dbDateToKey(row.startDate), dbDateToKey(row.endDate))) days.set(key, row.leaveType.name)
    map.set(row.employeeId, days)
  }
  return map
}

// ---------------------------------------------------------------------------
// Layanan mandiri: absen masuk / pulang
// ---------------------------------------------------------------------------

export const clockSchema = z.object({
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().min(0).max(100_000).nullable().optional(),
  photoFileId: z.string().nullable().optional(),
  note: z.string().trim().max(200).nullable().optional()
})

async function attendancePolicy(tenantId: string) {
  const [settings, geofenceFeature] = await Promise.all([getHrSettings(tenantId), can(tenantId, 'attendanceGeofence')])
  return { requireGeofence: geofenceFeature && settings.attendanceGeofenceEnforced, requireSelfie: geofenceFeature && settings.attendanceSelfieRequired }
}

/** Rekam yang masih terbuka (masuk tanpa pulang) dalam 20 jam terakhir — untuk shift malam. */
async function openRecord(employeeId: string) {
  return prisma.attendanceRecord.findFirst({
    where: { employeeId, clockInAt: { gte: new Date(Date.now() - OPEN_RECORD_MAX_HOURS * 3600_000) }, clockOutAt: null },
    orderBy: { clockInAt: 'desc' }
  })
}

export async function myAttendanceToday(event: H3Event) {
  const { ctx, employee } = await requireOwnEmployee(event, 'attendance.self')
  const branch = await employeeBranch(employee)
  const today = todayKey(branch.timezone)
  const resolve = await buildScheduleResolver(ctx.tenantId, [employee], today, today)
  const [record, open, policy, leave] = await Promise.all([
    prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: employee.id, workDate: dateKeyToDb(today) } } }),
    openRecord(employee.id),
    attendancePolicy(ctx.tenantId),
    approvedLeaveDays(ctx.tenantId, [employee.id], today, today)
  ])
  const current = open ?? record
  return {
    date: today,
    timezone: branch.timezone,
    branchName: branch.name,
    schedule: resolve(employee, today),
    onLeave: leave.get(employee.id)?.get(today) ?? null,
    record: current ? toRecordView(current, branch.timezone) : null,
    canClockIn: !current?.clockInAt,
    canClockOut: !!current?.clockInAt && !current.clockOutAt,
    policy: {
      ...policy,
      geofence: policy.requireGeofence && branch.latitude && branch.longitude && branch.geofenceRadiusMeters
        ? { latitude: Number(branch.latitude), longitude: Number(branch.longitude), radiusMeters: branch.geofenceRadiusMeters }
        : null
    }
  }
}

async function validateLocation(tenantId: string, branch: Awaited<ReturnType<typeof employeeBranch>>, input: z.infer<typeof clockSchema>, uploadedById: string) {
  const policy = await attendancePolicy(tenantId)
  let distance: number | null = null
  if (input.latitude != null && input.longitude != null && branch.latitude && branch.longitude) {
    distance = haversineMeters(input.latitude, input.longitude, Number(branch.latitude), Number(branch.longitude))
  }
  if (policy.requireGeofence && branch.geofenceRadiusMeters && branch.latitude && branch.longitude) {
    if (distance === null) throw httpError(400, 'OUTSIDE_GEOFENCE', 'Izinkan akses lokasi untuk absen di kantor ini.')
    // Toleransi akurasi GPS maksimal 100 m agar tidak bisa diakali dengan akurasi palsu.
    const allowance = Math.min(input.accuracy ?? 0, 100)
    if (distance > branch.geofenceRadiusMeters + allowance) {
      throw httpError(400, 'OUTSIDE_GEOFENCE', `Anda berada ±${distance} m dari ${branch.name}. Absen hanya bisa dalam radius ${branch.geofenceRadiusMeters} m.`)
    }
  }
  if (policy.requireSelfie && !input.photoFileId) throw httpError(400, 'VALIDATION_FAILED', 'Ambil foto selfie untuk absen.', { field: 'photo' })
  if (input.photoFileId) {
    const file = await prisma.storedFile.findFirst({ where: { id: input.photoFileId, tenantId, purpose: 'attendance_photo', uploadedById, deletedAt: null } })
    if (!file) throw httpError(400, 'VALIDATION_FAILED', 'Foto absen tidak ditemukan. Ambil ulang foto.', { field: 'photo' })
  }
  return distance
}

export async function clockIn(event: H3Event, input: z.infer<typeof clockSchema>) {
  const { ctx, employee } = await requireOwnEmployee(event, 'attendance.self')
  const branch = await employeeBranch(employee)
  if (await openRecord(employee.id)) throw conflict('Anda sudah absen masuk dan belum absen pulang.')
  const now = new Date()
  const today = zonedDateKey(now, branch.timezone)
  const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: employee.id, workDate: dateKeyToDb(today) } } })
  if (existing?.clockInAt) throw conflict('Anda sudah absen masuk hari ini.')
  const distance = await validateLocation(ctx.tenantId, branch, input, ctx.user.id)
  const resolve = await buildScheduleResolver(ctx.tenantId, [employee], today, today)
  const schedule = resolve(employee, today)
  const metrics = computeMetrics({ clockInAt: now, clockOutAt: null }, schedule, branch.timezone)
  const data = {
    tenantId: ctx.tenantId, branchId: employee.branchId, employeeId: employee.id, workDate: dateKeyToDb(today), shiftId: schedule.shiftId,
    scheduledStartAt: metrics.window?.start ?? null, scheduledEndAt: metrics.window?.end ?? null, clockInAt: now,
    clockInLatitude: input.latitude ?? null, clockInLongitude: input.longitude ?? null, clockInAccuracy: input.accuracy != null ? Math.round(input.accuracy) : null,
    clockInDistanceMeters: distance, clockInPhotoFileId: input.photoFileId ?? null, status: metrics.status, lateMinutes: metrics.lateMinutes, source: 'self' as const, note: input.note ?? null
  }
  const row = existing
    ? await prisma.attendanceRecord.update({ where: { id: existing.id }, data })
    : await prisma.attendanceRecord.create({ data })
  return toRecordView(row, branch.timezone)
}

export async function clockOut(event: H3Event, input: z.infer<typeof clockSchema>) {
  const { ctx, employee } = await requireOwnEmployee(event, 'attendance.self')
  const branch = await employeeBranch(employee)
  const open = await openRecord(employee.id)
  if (!open) throw conflict('Belum ada absen masuk yang bisa ditutup.')
  await validateLocation(ctx.tenantId, branch, { ...input, photoFileId: input.photoFileId ?? undefined }, ctx.user.id)
  const now = new Date()
  const key = dbDateToKey(open.workDate)
  const resolve = await buildScheduleResolver(ctx.tenantId, [employee], key, key)
  const metrics = computeMetrics({ clockInAt: open.clockInAt, clockOutAt: now }, resolve(employee, key), branch.timezone)
  const row = await prisma.attendanceRecord.update({
    where: { id: open.id },
    data: {
      clockOutAt: now, clockOutLatitude: input.latitude ?? null, clockOutLongitude: input.longitude ?? null, clockOutPhotoFileId: input.photoFileId ?? null,
      earlyLeaveMinutes: metrics.earlyLeaveMinutes, workedMinutes: metrics.workedMinutes
    }
  })
  return toRecordView(row, branch.timezone)
}

export async function uploadAttendancePhoto(event: H3Event) {
  const { ctx, employee } = await requireOwnEmployee(event, 'attendance.self')
  const stored = await handleUpload(event, { audience: 'tenant', tenantId: ctx.tenantId, uploadedById: ctx.user.id }, 'attendance_photo', `tenants/${ctx.tenantId}/attendance/${employee.id}`)
  return { id: stored.id }
}

// ---------------------------------------------------------------------------
// Kalender & daftar
// ---------------------------------------------------------------------------

export const rangeSchema = z.object({ from: dateKeySchema, to: dateKeySchema })

/** Kalender absen satu karyawan: jadwal + rekam + cuti per hari. */
export async function attendanceCalendar(tenantId: string, employee: Employee, fromKey: string, toKey: string) {
  if (toKey < fromKey || dateKeysBetween(fromKey, toKey).length > 62) throw httpError(400, 'VALIDATION_FAILED', 'Rentang maksimal 62 hari.')
  const branch = await employeeBranch(employee)
  const resolve = await buildScheduleResolver(tenantId, [employee], fromKey, toKey)
  const [records, leaves] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { employeeId: employee.id, workDate: { gte: dateKeyToDb(fromKey), lte: dateKeyToDb(toKey) } } }),
    approvedLeaveDays(tenantId, [employee.id], fromKey, toKey)
  ])
  const byDate = new Map(records.map(r => [dbDateToKey(r.workDate), r]))
  const today = todayKey(branch.timezone)
  const now = new Date()
  const days = dateKeysBetween(fromKey, toKey).map((key) => {
    const schedule = resolve(employee, key)
    const record = byDate.get(key)
    const leave = leaves.get(employee.id)?.get(key) ?? null
    return { date: key, schedule, record: record ? toRecordView(record, branch.timezone) : null, leave, status: dayStatus(schedule, record, leave, key, today, now, branch.timezone) }
  })
  return { timezone: branch.timezone, branchName: branch.name, days, summary: summarizeDays(days) }
}

/** Status tampilan per hari (rekam > cuti > libur > alpa bila jadwal sudah lewat). */
export function dayStatus(schedule: DaySchedule, record: AttendanceRecord | undefined, leave: string | null, key: string, today: string, now: Date, tz: string): string | null {
  if (record?.clockInAt) return record.status
  if (leave) return 'leave'
  if (schedule.kind === 'holiday') return 'holiday'
  if (schedule.kind === 'off') return 'off'
  const window = scheduledInstants(schedule, tz)
  if (key < today || (window && now > window.end)) return 'absent'
  return null
}

export function summarizeDays(days: Array<{ schedule: DaySchedule, status: string | null, record: { lateMinutes: number, workedMinutes: number } | null }>) {
  const scheduled = days.filter(d => d.schedule.kind === 'work')
  return {
    scheduledDays: scheduled.length,
    presentDays: days.filter(d => d.status === 'present' || d.status === 'late').length,
    lateDays: days.filter(d => d.status === 'late').length,
    absentDays: days.filter(d => d.status === 'absent').length,
    leaveDays: days.filter(d => d.status === 'leave').length,
    lateMinutes: days.reduce((sum, d) => sum + (d.record?.lateMinutes ?? 0), 0),
    workedMinutes: days.reduce((sum, d) => sum + (d.record?.workedMinutes ?? 0), 0)
  }
}

export async function myAttendanceCalendar(event: H3Event, query: z.infer<typeof rangeSchema>) {
  const { ctx, employee } = await requireOwnEmployee(event, 'attendance.self')
  return attendanceCalendar(ctx.tenantId, employee, query.from, query.to)
}

export async function employeeAttendanceCalendar(event: H3Event, employeeId: string, query: z.infer<typeof rangeSchema>) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'attendance.read', employeeId)
  return attendanceCalendar(ctx.tenantId, employee, query.from, query.to)
}

export const dailyQuerySchema = listQuerySchema.extend({
  date: dateKeySchema.optional(),
  branchId: z.string().optional(),
  status: z.enum(['present', 'late', 'absent', 'leave', 'off', 'holiday', 'not_yet']).optional()
})

/** Papan harian: semua karyawan aktif dalam cakupan + status hari itu. */
export async function dailyAttendance(event: H3Event, query: z.infer<typeof dailyQuerySchema>) {
  const ctx = await requireTenantAbility(event, 'attendance.read')
  const date = query.date ?? todayKey(ctx.tenant.timezone)
  const employees = await prisma.employee.findMany({
    where: {
      AND: [
        await visibleEmployeesWhere(event, ctx),
        { status: { in: ['active', 'probation', 'on_leave'] }, joinDate: { lte: dateKeyToDb(date) } },
        query.branchId ? { branchId: query.branchId } : {},
        query.search ? { OR: [{ fullName: { contains: query.search, mode: 'insensitive' } }, { employeeNumber: { contains: query.search, mode: 'insensitive' } }] } : {}
      ]
    },
    orderBy: { fullName: 'asc' },
    take: 1000,
    select: { id: true, fullName: true, employeeNumber: true, branchId: true, shiftId: true, branch: { select: { name: true, timezone: true } } }
  })
  const ids = employees.map(e => e.id)
  const resolve = await buildScheduleResolver(ctx.tenantId, employees, date, date)
  const [records, leaves] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { tenantId: ctx.tenantId, workDate: dateKeyToDb(date), employeeId: { in: ids } } }),
    approvedLeaveDays(ctx.tenantId, ids, date, date)
  ])
  const byEmployee = new Map(records.map(r => [r.employeeId, r]))
  const now = new Date()
  const rows = employees.map((e) => {
    const schedule = resolve(e, date)
    const record = byEmployee.get(e.id)
    const leave = leaves.get(e.id)?.get(date) ?? null
    const status = dayStatus(schedule, record, leave, date, todayKey(e.branch.timezone), now, e.branch.timezone) ?? 'not_yet'
    return { employeeId: e.id, fullName: e.fullName, employeeNumber: e.employeeNumber, branchName: e.branch.name, schedule, leave, status, record: record ? toRecordView(record, e.branch.timezone) : null }
  })
  const counts = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {})
  const filtered = query.status ? rows.filter(r => r.status === query.status) : rows
  const start = (query.page - 1) * query.limit
  return { date, counts, items: filtered.slice(start, start + query.limit), meta: listMeta(query.page, query.limit, filtered.length) }
}

// ---------------------------------------------------------------------------
// Input admin & koreksi
// ---------------------------------------------------------------------------

export const adminAttendanceSchema = z.object({
  workDate: dateKeySchema,
  clockIn: timeSchema.nullable().optional(),
  clockOut: timeSchema.nullable().optional(),
  note: z.string().trim().min(3, 'Tuliskan alasan perubahan.').max(200)
})

function snapshot(record: AttendanceRecord | null) {
  if (!record) return null
  return { clockInAt: record.clockInAt?.toISOString() ?? null, clockOutAt: record.clockOutAt?.toISOString() ?? null, status: record.status, lateMinutes: record.lateMinutes, workedMinutes: record.workedMinutes, source: record.source }
}

/** Terapkan jam masuk/pulang (lokal kantor) ke rekam hari itu — dipakai admin & koreksi disetujui. */
/** Jadwal hari itu — dibaca SEBELUM transaksi (memakai client global). */
async function scheduleOn(employee: Employee, workDate: string) {
  const resolve = await buildScheduleResolver(employee.tenantId, [employee], workDate, workDate)
  return { schedule: resolve(employee, workDate), tz: await branchTimezone(employee.branchId) }
}

async function applyTimes(tx: Prisma.TransactionClient, employee: Employee, workDate: string, plan: { schedule: DaySchedule, tz: string }, times: { clockIn?: string | null, clockOut?: string | null }, source: 'admin' | 'correction', note: string | null) {
  const { schedule, tz } = plan
  const existing = await tx.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: employee.id, workDate: dateKeyToDb(workDate) } } })
  const clockInAt = times.clockIn ? zonedInstant(workDate, times.clockIn, tz) : (times.clockIn === null ? null : existing?.clockInAt ?? null)
  let clockOutAt = times.clockOut ? zonedInstant(workDate, times.clockOut, tz) : (times.clockOut === null ? null : existing?.clockOutAt ?? null)
  // Jam pulang lebih awal dari jam masuk = melewati tengah malam.
  if (clockInAt && clockOutAt && clockOutAt <= clockInAt) clockOutAt = new Date(clockOutAt.getTime() + 86400_000)
  if (!clockInAt && clockOutAt) throw httpError(400, 'VALIDATION_FAILED', 'Isi jam masuk lebih dulu.', { field: 'clockIn' })
  const metrics = computeMetrics({ clockInAt, clockOutAt }, schedule, tz)
  const data = {
    clockInAt, clockOutAt, status: clockInAt ? metrics.status : ('absent' as const), lateMinutes: metrics.lateMinutes, earlyLeaveMinutes: metrics.earlyLeaveMinutes,
    workedMinutes: metrics.workedMinutes, source, note, correctedAt: existing ? new Date() : null,
    scheduledStartAt: metrics.window?.start ?? null, scheduledEndAt: metrics.window?.end ?? null, shiftId: schedule.shiftId
  }
  const row = existing
    ? await tx.attendanceRecord.update({ where: { id: existing.id }, data })
    : await tx.attendanceRecord.create({ data: { ...data, tenantId: employee.tenantId, branchId: employee.branchId, employeeId: employee.id, workDate: dateKeyToDb(workDate) } })
  return { before: snapshot(existing), row }
}

export async function adminSetAttendance(event: H3Event, employeeId: string, input: z.infer<typeof adminAttendanceSchema>) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'attendance.write', employeeId)
  const tz = await branchTimezone(employee.branchId)
  if (input.workDate > todayKey(tz)) throw httpError(400, 'VALIDATION_FAILED', 'Tanggal tidak boleh di masa depan.', { field: 'workDate' })
  const plan = await scheduleOn(employee, input.workDate)
  const result = await prisma.$transaction(async (tx) => {
    const { before, row } = await applyTimes(tx, employee, input.workDate, plan, input, 'admin', input.note)
    // Jejak perubahan: koreksi yang langsung disetujui oleh admin.
    if (before) {
      const code = await nextRecordCode(tx, ctx.tenantId, RECORD_CODE_PREFIX.attendance_correction, ctx.tenant.timezone)
      await tx.attendanceCorrection.create({
        data: { tenantId: ctx.tenantId, branchId: employee.branchId, employeeId: employee.id, code, workDate: dateKeyToDb(input.workDate), attendanceRecordId: row.id, reason: input.note, before: before as Prisma.InputJsonValue, status: 'approved', decidedAt: new Date(), createdById: ctx.user.id }
      })
    }
    return row
  })
  await recordAudit(event, { audience: 'tenant', action: 'attendance.admin_set', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'employee', targetId: employee.id, metadata: { workDate: input.workDate } })
  return toRecordView(result, tz)
}

export const correctionSchema = z.object({
  workDate: dateKeySchema,
  clockIn: timeSchema.nullable().optional(),
  clockOut: timeSchema.nullable().optional(),
  reason: z.string().trim().min(5, 'Jelaskan alasan koreksi (minimal 5 karakter).').max(300)
}).refine(v => v.clockIn || v.clockOut, { message: 'Isi jam masuk atau jam pulang yang benar.', path: ['clockIn'] })

export async function requestCorrection(event: H3Event, input: z.infer<typeof correctionSchema>) {
  const { ctx, employee } = await requireOwnEmployee(event, 'attendance.self')
  const tz = await branchTimezone(employee.branchId)
  const today = todayKey(tz)
  if (input.workDate > today) throw httpError(400, 'VALIDATION_FAILED', 'Koreksi hanya untuk hari ini atau sebelumnya.', { field: 'workDate' })
  if (input.workDate < addDaysToKey(today, -31)) throw httpError(400, 'VALIDATION_FAILED', 'Koreksi hanya bisa diajukan maksimal 31 hari ke belakang.', { field: 'workDate' })
  const pending = await prisma.attendanceCorrection.findFirst({ where: { employeeId: employee.id, workDate: dateKeyToDb(input.workDate), status: 'pending' } })
  if (pending) throw conflict('Sudah ada koreksi yang menunggu untuk tanggal ini.')
  const record = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: employee.id, workDate: dateKeyToDb(input.workDate) } } })
  const steps = await planApprovalSteps(ctx.tenantId, 'attendance_correction', employee)
  const correction = await prisma.$transaction(async (tx) => {
    const code = await nextRecordCode(tx, ctx.tenantId, RECORD_CODE_PREFIX.attendance_correction, ctx.tenant.timezone)
    const row = await tx.attendanceCorrection.create({
      data: {
        tenantId: ctx.tenantId, branchId: employee.branchId, employeeId: employee.id, code, workDate: dateKeyToDb(input.workDate), attendanceRecordId: record?.id ?? null,
        requestedClockIn: input.clockIn ? zonedInstant(input.workDate, input.clockIn, tz) : null,
        requestedClockOut: input.clockOut ? zonedInstant(input.workDate, input.clockOut, tz) : null,
        reason: input.reason, createdById: ctx.user.id
      }
    })
    await insertApprovalSteps(tx, { tenantId: ctx.tenantId, subjectType: 'attendance_correction', subjectId: row.id, steps })
    return row
  })
  await notifyCurrentApprovers(ctx.tenantId, 'attendance_correction', correction.id, employee, 'approval_requested', { requestTypeLabel: 'koreksi absen', date: formatDateId(input.workDate) })
  return { id: correction.id, code: correction.code }
}

export const correctionListSchema = listQuerySchema.extend({ status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(), mine: z.coerce.boolean().optional() })

async function correctionViews(rows: Array<Prisma.AttendanceCorrectionGetPayload<object>>, d?: DeciderContext) {
  const employees = await prisma.employee.findMany({ where: { id: { in: [...new Set(rows.map(r => r.employeeId))] } }, select: { id: true, fullName: true, employeeNumber: true, branchId: true, branch: { select: { timezone: true } } } })
  const byId = new Map(employees.map(e => [e.id, e]))
  const steps = await stepsFor('attendance_correction', rows.map(r => r.id))
  const names = await approverNamesFor([...steps.values()].flat())
  return rows.map((r) => {
    const e = byId.get(r.employeeId)
    const tz = e?.branch.timezone ?? 'Asia/Jakarta'
    const s = steps.get(r.id) ?? []
    const step = currentStep(s)
    return {
      id: r.id, code: r.code, workDate: dbDateToKey(r.workDate), employee: e ? { id: e.id, fullName: e.fullName, employeeNumber: e.employeeNumber } : null,
      requestedClockIn: r.requestedClockIn ? zonedTimeLabel(r.requestedClockIn, tz) : null, requestedClockOut: r.requestedClockOut ? zonedTimeLabel(r.requestedClockOut, tz) : null,
      reason: r.reason, status: r.status, createdAt: r.createdAt.toISOString(), steps: s.map(x => toStepView(x, names)),
      canDecide: !!(d && step && e && r.status === 'pending' && canDecideStep(d, 'attendance_correction', step, e))
    }
  })
}

export async function listCorrections(event: H3Event, query: z.infer<typeof correctionListSchema>) {
  const ctx = await requireTenantAbility(event, 'attendance.read')
  const where: Prisma.AttendanceCorrectionWhereInput = { tenantId: ctx.tenantId, ...(await employeeScopeWhere(event, ctx)), ...(query.status ? { status: query.status } : {}) }
  const [rows, total] = await Promise.all([
    prisma.attendanceCorrection.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.attendanceCorrection.count({ where })
  ])
  return { items: await correctionViews(rows, { ctx, me: await ownEmployee(event, ctx) }), meta: listMeta(query.page, query.limit, total) }
}

export async function myCorrections(event: H3Event) {
  const { employee } = await requireOwnEmployee(event, 'attendance.self')
  const rows = await prisma.attendanceCorrection.findMany({ where: { employeeId: employee.id }, orderBy: { createdAt: 'desc' }, take: 50 })
  return { items: await correctionViews(rows) }
}

export async function decideCorrection(event: H3Event, id: string, decision: Decision) {
  const ctx = await requireTenantAbility(event, 'attendance.read')
  const correction = await prisma.attendanceCorrection.findFirst({ where: { id, tenantId: ctx.tenantId, ...(await employeeScopeWhere(event, ctx)) } })
  if (!correction) throw notFound('Pengajuan koreksi tidak ditemukan.')
  if (correction.status !== 'pending') throw conflict('Pengajuan ini sudah diputuskan.')
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: correction.employeeId } })
  const tz = await branchTimezone(employee.branchId)
  const d = { ctx, me: await ownEmployee(event, ctx) }
  const plan = await scheduleOn(employee, dbDateToKey(correction.workDate))
  const final = await prisma.$transaction(async (tx) => {
    const result = await decideCurrentStep(tx, d, { subjectType: 'attendance_correction', subjectId: id, requester: employee, decision })
    if (result === 'rejected') await tx.attendanceCorrection.update({ where: { id }, data: { status: 'rejected', decidedAt: new Date() } })
    if (result === 'approved') {
      const key = dbDateToKey(correction.workDate)
      const { before, row } = await applyTimes(tx, employee, key, plan, {
        clockIn: correction.requestedClockIn ? zonedTimeLabel(correction.requestedClockIn, tz) : undefined,
        clockOut: correction.requestedClockOut ? zonedTimeLabel(correction.requestedClockOut, tz) : undefined
      }, 'correction', `Koreksi ${correction.code}`)
      await tx.attendanceCorrection.update({ where: { id }, data: { status: 'approved', decidedAt: new Date(), attendanceRecordId: row.id, before: (before ?? undefined) as Prisma.InputJsonValue | undefined } })
    }
    return result
  })
  await recordAudit(event, { audience: 'tenant', action: `attendance_correction.${decision.decision === 'approved' ? 'approve' : 'reject'}`, actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'attendance_correction', targetId: id })
  if (final) await notifyRequester(ctx.tenantId, employee, 'request_decided', { requestTypeLabel: 'koreksi absen', decisionLabel: final === 'approved' ? 'disetujui' : 'ditolak', detailUrl: '/app/me/attendance' })
  else await notifyCurrentApprovers(ctx.tenantId, 'attendance_correction', id, employee, 'approval_requested', { requestTypeLabel: 'koreksi absen', date: formatDateId(dbDateToKey(correction.workDate)) })
  return { status: final ?? 'pending' }
}

export async function cancelMyCorrection(event: H3Event, id: string) {
  const { employee } = await requireOwnEmployee(event, 'attendance.self')
  const row = await prisma.attendanceCorrection.findFirst({ where: { id, employeeId: employee.id } })
  if (!row) throw notFound('Pengajuan tidak ditemukan.')
  if (row.status !== 'pending') throw conflict('Hanya pengajuan yang menunggu yang bisa dibatalkan.')
  await prisma.$transaction(async (tx) => {
    await tx.attendanceCorrection.update({ where: { id }, data: { status: 'cancelled' } })
    await cancelApprovalSteps(tx, 'attendance_correction', id)
  })
  return { success: true }
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

/** Tutup otomatis absen yang lupa pulang (idempoten: hanya rekam yang masih terbuka). */
export async function autoCloseOpenAttendance(now = new Date()) {
  const open = await prisma.attendanceRecord.findMany({
    where: { clockInAt: { not: null, lt: new Date(now.getTime() - 3600_000) }, clockOutAt: null },
    take: 500,
    include: { employee: { select: { fullName: true, tenantUserId: true } } }
  })
  const settingsCache = new Map<string, number>()
  let closed = 0
  for (const r of open) {
    if (!settingsCache.has(r.tenantId)) settingsCache.set(r.tenantId, (await getHrSettings(r.tenantId)).autoCloseAfterHours)
    const hours = settingsCache.get(r.tenantId)!
    const deadline = r.scheduledEndAt ? r.scheduledEndAt.getTime() + hours * 3600_000 : r.clockInAt!.getTime() + 16 * 3600_000
    if (now.getTime() < deadline) continue
    const clockOutAt = r.scheduledEndAt && r.scheduledEndAt > r.clockInAt! ? r.scheduledEndAt : new Date(r.clockInAt!.getTime() + 8 * 3600_000)
    const updated = await prisma.attendanceRecord.updateMany({
      where: { id: r.id, clockOutAt: null },
      data: { clockOutAt, autoClosedAt: now, workedMinutes: Math.max(0, Math.floor((clockOutAt.getTime() - r.clockInAt!.getTime()) / 60000) - 60), note: 'Ditutup otomatis (lupa absen pulang)' }
    })
    if (updated.count && r.employee.tenantUserId) {
      await safeCreateNotification({ audience: 'tenant', tenantId: r.tenantId, tenantUserId: r.employee.tenantUserId, templateKey: 'attendance_missing', variables: { name: r.employee.fullName, date: formatDateId(dbDateToKey(r.workDate)) }, channels: { email: false } })
    }
    closed += updated.count
  }
  return { checked: open.length, closed }
}
