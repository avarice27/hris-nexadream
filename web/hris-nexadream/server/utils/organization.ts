import type { H3Event } from 'h3'
import { z } from 'zod'
import { dateKeyToDb, dbDateToKey } from '#shared/utils/timezone'

// 11.1 Organisasi: departemen, jabatan, kalender libur, pengaturan HR.

const nameSchema = z.string().trim().min(2, 'Nama minimal 2 karakter.').max(80, 'Nama maksimal 80 karakter.')

export const departmentSchema = z.object({
  name: nameSchema,
  code: z.string().trim().max(20).nullable().optional(),
  parentId: z.string().nullable().optional(),
  isActive: z.boolean().optional()
})
export const positionSchema = z.object({
  name: nameSchema,
  level: z.number().int().min(1).max(20).nullable().optional(),
  isActive: z.boolean().optional()
})
export const holidaySchema = z.object({
  date: dateKeySchema,
  name: nameSchema,
  isCollectiveLeave: z.boolean().optional(),
  branchId: z.string().nullable().optional()
})

async function audit(event: H3Event, ctx: TenantContext, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  await recordAudit(event, { audience: 'tenant', action, actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType, targetId, metadata })
}

function uniqueName(error: unknown, label: string): never {
  if ((error as { code?: string })?.code === 'P2002') throw conflict(`${label} dengan nama itu sudah ada.`)
  throw error
}

// --- Departemen ------------------------------------------------------------

export async function listDepartments(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'employees.read')
  const rows = await prisma.department.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { employees: { where: { status: { notIn: ['terminated'] } } } } } }
  })
  return { items: rows.map(d => ({ id: d.id, name: d.name, code: d.code, parentId: d.parentId, isActive: d.isActive, employeeCount: d._count.employees })) }
}

async function assertParent(tenantId: string, parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return
  if (parentId === selfId) throw httpError(400, 'VALIDATION_FAILED', 'Departemen tidak bisa menjadi induk dirinya sendiri.')
  const parent = await prisma.department.findFirst({ where: { id: parentId, tenantId } })
  if (!parent) throw notFound('Departemen induk tidak ditemukan.')
  // Cegah siklus: telusuri leluhur induk.
  let cursor: string | null = parent.parentId
  for (let depth = 0; cursor && depth < 20; depth++) {
    if (cursor === selfId) throw httpError(400, 'VALIDATION_FAILED', 'Susunan departemen tidak boleh melingkar.')
    cursor = (await prisma.department.findUnique({ where: { id: cursor }, select: { parentId: true } }))?.parentId ?? null
  }
}

export async function createDepartment(event: H3Event, input: z.infer<typeof departmentSchema>) {
  const ctx = await requireTenantAbility(event, 'employees.write')
  await assertParent(ctx.tenantId, input.parentId)
  const row = await prisma.department.create({ data: { tenantId: ctx.tenantId, name: input.name, code: input.code || null, parentId: input.parentId || null } }).catch(e => uniqueName(e, 'Departemen'))
  await audit(event, ctx, 'department.create', 'department', row.id)
  return row
}

export async function updateDepartment(event: H3Event, id: string, input: Partial<z.infer<typeof departmentSchema>>) {
  const ctx = await requireTenantAbility(event, 'employees.write')
  const row = await prisma.department.findFirst({ where: { id, tenantId: ctx.tenantId } })
  if (!row) throw notFound('Departemen tidak ditemukan.')
  if (input.parentId !== undefined) await assertParent(ctx.tenantId, input.parentId, id)
  const updated = await prisma.department.update({
    where: { id },
    data: { name: input.name, code: input.code === undefined ? undefined : (input.code || null), parentId: input.parentId === undefined ? undefined : (input.parentId || null), isActive: input.isActive }
  }).catch(e => uniqueName(e, 'Departemen'))
  await audit(event, ctx, 'department.update', 'department', id)
  return updated
}

export async function deleteDepartment(event: H3Event, id: string) {
  const ctx = await requireTenantAbility(event, 'employees.write')
  const row = await prisma.department.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { _count: { select: { employees: true, children: true } } } })
  if (!row) throw notFound('Departemen tidak ditemukan.')
  if (row._count.employees || row._count.children) {
    throw conflict('Departemen masih dipakai karyawan atau sub-departemen. Nonaktifkan saja bila tidak dipakai lagi.')
  }
  await prisma.department.delete({ where: { id } })
  await audit(event, ctx, 'department.delete', 'department', id, { name: row.name })
  return { success: true }
}

// --- Jabatan ---------------------------------------------------------------

export async function listPositions(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'employees.read')
  const rows = await prisma.position.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ isActive: 'desc' }, { level: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { employees: { where: { status: { notIn: ['terminated'] } } } } } }
  })
  return { items: rows.map(p => ({ id: p.id, name: p.name, level: p.level, isActive: p.isActive, employeeCount: p._count.employees })) }
}

export async function createPosition(event: H3Event, input: z.infer<typeof positionSchema>) {
  const ctx = await requireTenantAbility(event, 'employees.write')
  const row = await prisma.position.create({ data: { tenantId: ctx.tenantId, name: input.name, level: input.level ?? null } }).catch(e => uniqueName(e, 'Jabatan'))
  await audit(event, ctx, 'position.create', 'position', row.id)
  return row
}

export async function updatePosition(event: H3Event, id: string, input: Partial<z.infer<typeof positionSchema>>) {
  const ctx = await requireTenantAbility(event, 'employees.write')
  if (!await prisma.position.findFirst({ where: { id, tenantId: ctx.tenantId } })) throw notFound('Jabatan tidak ditemukan.')
  const row = await prisma.position.update({ where: { id }, data: { name: input.name, level: input.level, isActive: input.isActive } }).catch(e => uniqueName(e, 'Jabatan'))
  await audit(event, ctx, 'position.update', 'position', id)
  return row
}

export async function deletePosition(event: H3Event, id: string) {
  const ctx = await requireTenantAbility(event, 'employees.write')
  const row = await prisma.position.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { _count: { select: { employees: true } } } })
  if (!row) throw notFound('Jabatan tidak ditemukan.')
  if (row._count.employees) throw conflict('Jabatan masih dipakai karyawan. Nonaktifkan saja bila tidak dipakai lagi.')
  await prisma.position.delete({ where: { id } })
  await audit(event, ctx, 'position.delete', 'position', id, { name: row.name })
  return { success: true }
}

// --- Hari libur ------------------------------------------------------------

export const holidayListSchema = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() })

export async function listHolidays(event: H3Event, query: z.infer<typeof holidayListSchema>) {
  const ctx = await requireTenantContext(event)
  const year = query.year ?? new Date().getUTCFullYear()
  const rows = await prisma.holiday.findMany({
    where: { tenantId: ctx.tenantId, date: { gte: dateKeyToDb(`${year}-01-01`), lte: dateKeyToDb(`${year}-12-31`) } },
    orderBy: { date: 'asc' }
  })
  return { year, items: rows.map(h => ({ id: h.id, date: dbDateToKey(h.date), name: h.name, isCollectiveLeave: h.isCollectiveLeave, branchId: h.branchId })) }
}

async function assertHolidayBranch(event: H3Event, branchId: string | null | undefined) {
  if (branchId) await requireBranchAccess(event, branchId)
}

export async function createHoliday(event: H3Event, input: z.infer<typeof holidaySchema>) {
  const ctx = await requireTenantAbility(event, 'attendance.write')
  await assertHolidayBranch(event, input.branchId)
  const row = await prisma.holiday.create({ data: { tenantId: ctx.tenantId, date: dateKeyToDb(input.date), name: input.name, isCollectiveLeave: input.isCollectiveLeave ?? false, branchId: input.branchId || null } })
  await audit(event, ctx, 'holiday.create', 'holiday', row.id, { date: input.date })
  return row
}

export async function updateHoliday(event: H3Event, id: string, input: Partial<z.infer<typeof holidaySchema>>) {
  const ctx = await requireTenantAbility(event, 'attendance.write')
  if (!await prisma.holiday.findFirst({ where: { id, tenantId: ctx.tenantId } })) throw notFound('Hari libur tidak ditemukan.')
  if (input.branchId) await assertHolidayBranch(event, input.branchId)
  const row = await prisma.holiday.update({
    where: { id },
    data: { date: input.date ? dateKeyToDb(input.date) : undefined, name: input.name, isCollectiveLeave: input.isCollectiveLeave, branchId: input.branchId === undefined ? undefined : (input.branchId || null) }
  })
  await audit(event, ctx, 'holiday.update', 'holiday', id)
  return row
}

export async function deleteHoliday(event: H3Event, id: string) {
  const ctx = await requireTenantAbility(event, 'attendance.write')
  if (!await prisma.holiday.findFirst({ where: { id, tenantId: ctx.tenantId } })) throw notFound('Hari libur tidak ditemukan.')
  await prisma.holiday.delete({ where: { id } })
  await audit(event, ctx, 'holiday.delete', 'holiday', id)
  return { success: true }
}

/** Salin libur nasional tahun itu dari data referensi platform (idempoten per tanggal). */
export async function importNationalHolidays(event: H3Event, year: number) {
  const ctx = await requireTenantAbility(event, 'attendance.write')
  const list = await nationalHolidays(year)
  if (!list.length) throw notFound(`Daftar libur nasional ${year} belum tersedia. Tambahkan manual atau hubungi dukungan.`)
  const existing = new Set((await prisma.holiday.findMany({
    where: { tenantId: ctx.tenantId, branchId: null, date: { gte: dateKeyToDb(`${year}-01-01`), lte: dateKeyToDb(`${year}-12-31`) } },
    select: { date: true }
  })).map(h => dbDateToKey(h.date)))
  const toCreate = list.filter(h => !existing.has(h.date))
  if (toCreate.length) {
    await prisma.holiday.createMany({ data: toCreate.map(h => ({ tenantId: ctx.tenantId, date: dateKeyToDb(h.date), name: h.name, isCollectiveLeave: h.isCollectiveLeave ?? false })) })
  }
  await audit(event, ctx, 'holiday.import', 'holiday', String(year), { created: toCreate.length })
  return { created: toCreate.length, skipped: list.length - toCreate.length }
}

/** Libur dalam rentang untuk satu kantor: Set kunci tanggal. */
export async function holidayKeys(tenantId: string, branchId: string, fromKey: string, toKey: string): Promise<Map<string, { name: string, isCollectiveLeave: boolean }>> {
  const rows = await prisma.holiday.findMany({
    where: { tenantId, date: { gte: dateKeyToDb(fromKey), lte: dateKeyToDb(toKey) }, OR: [{ branchId: null }, { branchId }] },
    select: { date: true, name: true, isCollectiveLeave: true }
  })
  return new Map(rows.map(r => [dbDateToKey(r.date), { name: r.name, isCollectiveLeave: r.isCollectiveLeave }]))
}

// --- Pengaturan HR ---------------------------------------------------------

export const hrSettingsSchema = z.object({
  approvalChains: approvalChainsSchema.optional(),
  attendanceSelfieRequired: z.boolean().optional(),
  attendanceGeofenceEnforced: z.boolean().optional(),
  autoCloseAfterHours: z.number().int().min(1).max(24).optional(),
  bpjsJkkRatePercent: z.number().min(0.24).max(1.74).optional(),
  payslipVisibleOnApproval: z.boolean().optional()
})

export async function readHrSettings(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'settings.manage')
  const s = await getHrSettings(ctx.tenantId)
  return {
    approvalChains: s.approvalChains ?? {},
    customApprovalFlows: await can(ctx.tenantId, 'customApprovalFlows'),
    attendanceSelfieRequired: s.attendanceSelfieRequired,
    attendanceGeofenceEnforced: s.attendanceGeofenceEnforced,
    geofenceAvailable: await can(ctx.tenantId, 'attendanceGeofence'),
    autoCloseAfterHours: s.autoCloseAfterHours,
    bpjsJkkRatePercent: toAmount(s.bpjsJkkRatePercent),
    payslipVisibleOnApproval: s.payslipVisibleOnApproval
  }
}

export async function updateHrSettings(event: H3Event, input: z.infer<typeof hrSettingsSchema>) {
  const ctx = await requireTenantAbility(event, 'settings.manage')
  if (input.approvalChains) await requireEntitlement(event, 'customApprovalFlows')
  if (input.attendanceGeofenceEnforced || input.attendanceSelfieRequired) await requireEntitlement(event, 'attendanceGeofence')
  await getHrSettings(ctx.tenantId)
  await prisma.tenantHrSettings.update({ where: { tenantId: ctx.tenantId }, data: { ...input, approvalChains: input.approvalChains ?? undefined } })
  await audit(event, ctx, 'hr_settings.update', 'tenant', ctx.tenantId, { fields: Object.keys(input) })
  return readHrSettings(event)
}
