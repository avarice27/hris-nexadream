import type { H3Event } from 'h3'
import { z } from 'zod'
import { isValidIndonesianPhone, normalizeIndonesianPhone } from '#shared/utils/phone'
import { TIMEZONES } from '#shared/utils/settings'
import type { Branch, Prisma } from '~~/generated/prisma/client'
import { allocateBranchCode } from './registration'

// Kantor / lokasi kerja. Dinonaktifkan, tidak dihapus, bila ada riwayat yang menunjuk ke sana.

export const branchSchema = z.object({
  name: z.string().trim().min(2, 'Nama kantor minimal 2 karakter.').max(80, 'Nama kantor terlalu panjang.'),
  address: z.string().trim().max(300).nullable().optional(),
  phone: z.string().trim().refine(v => v === '' || isValidIndonesianPhone(v), 'Masukkan nomor telepon yang valid.').nullable().optional(),
  timezone: z.enum(TIMEZONES, 'Pilih zona waktu WIB, WITA, atau WIT.'),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  geofenceRadiusMeters: z.number().int().min(20, 'Radius minimal 20 meter.').max(5000, 'Radius maksimal 5.000 meter.').nullable().optional()
}).refine(v => (v.latitude == null) === (v.longitude == null), { message: 'Isi lintang dan bujur bersamaan.', path: ['longitude'] })

export const branchUpdateSchema = branchSchema.and(z.object({ isActive: z.boolean().optional() }))

export function toBranchView(branch: Branch) {
  return {
    id: branch.id,
    name: branch.name,
    code: branch.code,
    address: branch.address,
    phone: branch.phone,
    timezone: branch.timezone,
    isActive: branch.isActive,
    isPrimary: branch.isPrimary,
    latitude: branch.latitude === null ? null : Number(branch.latitude),
    longitude: branch.longitude === null ? null : Number(branch.longitude),
    geofenceRadiusMeters: branch.geofenceRadiusMeters,
    createdAt: branch.createdAt.toISOString()
  }
}

/** Semua anggota bisa melihat kantor dalam cakupannya (untuk pemilih kantor). */
export async function listBranches(event: H3Event) {
  const ctx = await requireTenantContext(event)
  const branches = await prisma.branch.findMany({
    where: { tenantId: ctx.tenantId, ...branchScopeWhere(ctx, 'id') },
    orderBy: [{ isPrimary: 'desc' }, { isActive: 'desc' }, { name: 'asc' }]
  })
  const [entitlements, activeCount] = await Promise.all([
    getEntitlements(ctx.tenantId),
    prisma.branch.count({ where: { tenantId: ctx.tenantId, isActive: true } })
  ])
  return {
    items: branches.map(toBranchView),
    usage: { active: activeCount, limit: entitlements.limits.branches },
    geofenceAvailable: entitlements.features.attendanceGeofence
  }
}

/** Mengatur geofence adalah fitur berbayar; MENGHAPUSnya tidak pernah diblokir. */
async function assertGeofenceAllowed(tenantId: string, input: { latitude?: number | null, geofenceRadiusMeters?: number | null }) {
  const settingGeofence = input.latitude != null || input.geofenceRadiusMeters != null
  if (settingGeofence && !(await can(tenantId, 'attendanceGeofence'))) {
    throw httpError(402, 'PLAN_REQUIRED', 'Absensi geofence belum tersedia di langganan Anda. Upgrade untuk membukanya.', { feature: 'attendanceGeofence' })
  }
}

function branchData(input: z.infer<typeof branchSchema>): Omit<Prisma.BranchUncheckedCreateInput, 'tenantId'> {
  return {
    name: input.name,
    address: input.address || null,
    phone: input.phone ? normalizeIndonesianPhone(input.phone) : null,
    timezone: input.timezone,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    geofenceRadiusMeters: input.latitude != null ? (input.geofenceRadiusMeters ?? null) : null
  }
}

export async function createBranch(event: H3Event, input: z.infer<typeof branchSchema>) {
  const ctx = await requireTenantAbility(event, 'branches.manage')
  await assertWithinLimit(ctx.tenantId, 'branches', await prisma.branch.count({ where: { tenantId: ctx.tenantId, isActive: true } }))
  await assertGeofenceAllowed(ctx.tenantId, input)
  const branch = await prisma.$transaction(async tx => tx.branch.create({
    data: { tenantId: ctx.tenantId, code: await allocateBranchCode(tx), ...branchData(input) }
  }))
  invalidateEntitlements(ctx.tenantId)
  await recordAudit(event, {
    audience: 'tenant', action: 'branch.create', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: ctx.tenantId, impersonatorId: ctx.impersonatorId, targetType: 'branch', targetId: branch.id
  })
  return toBranchView(branch)
}

export async function updateBranch(event: H3Event, id: string, input: z.infer<typeof branchUpdateSchema>) {
  const ctx = await requireTenantAbility(event, 'branches.manage')
  const branch = await requireBranchAccess(event, id)

  if (input.isActive === false && branch.isPrimary) {
    throw conflict('Kantor utama tidak bisa dinonaktifkan. Jadikan kantor lain sebagai kantor utama terlebih dahulu.')
  }
  if (input.isActive === true && !branch.isActive) {
    await assertWithinLimit(ctx.tenantId, 'branches', await prisma.branch.count({ where: { tenantId: ctx.tenantId, isActive: true } }))
  }
  const geofenceChanged = input.latitude !== (branch.latitude === null ? null : Number(branch.latitude))
    || input.geofenceRadiusMeters !== branch.geofenceRadiusMeters
  if (geofenceChanged) await assertGeofenceAllowed(ctx.tenantId, input)

  const updated = await prisma.branch.update({
    where: { id: branch.id },
    data: { ...branchData(input), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) }
  })
  invalidateEntitlements(ctx.tenantId)
  const action = input.isActive === false && branch.isActive
    ? 'branch.deactivate'
    : input.isActive === true && !branch.isActive ? 'branch.reactivate' : 'branch.update'
  await recordAudit(event, {
    audience: 'tenant', action, actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: ctx.tenantId, impersonatorId: ctx.impersonatorId, targetType: 'branch', targetId: branch.id
  })
  return toBranchView(updated)
}

export async function setPrimaryBranch(event: H3Event, id: string) {
  const ctx = await requireTenantAbility(event, 'branches.manage')
  const branch = await requireBranchAccess(event, id)
  if (!branch.isActive) throw conflict('Aktifkan kantor ini terlebih dahulu.')
  await prisma.$transaction([
    prisma.branch.updateMany({ where: { tenantId: ctx.tenantId, isPrimary: true }, data: { isPrimary: false } }),
    prisma.branch.update({ where: { id: branch.id }, data: { isPrimary: true } })
  ])
  await recordAudit(event, {
    audience: 'tenant', action: 'branch.set_primary', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: ctx.tenantId, impersonatorId: ctx.impersonatorId, targetType: 'branch', targetId: branch.id
  })
  return { success: true }
}

/**
 * Hapus hanya bila tidak ada yang menunjuk ke kantor ini. Modul HR (karyawan, absensi, slip gaji)
 * menambah pemeriksaannya di sini saat dibangun; sampai itu, cakupan akses anggota tim ikut dihitung.
 */
export async function deleteBranch(event: H3Event, id: string) {
  const ctx = await requireTenantAbility(event, 'branches.manage')
  const branch = await requireBranchAccess(event, id)
  if (branch.isPrimary) throw conflict('Kantor utama tidak bisa dihapus.')
  const [members, employees, attendance, history] = await Promise.all([
    prisma.tenantMembershipBranch.count({ where: { tenantId: ctx.tenantId, branchId: branch.id } }),
    prisma.employee.count({ where: { tenantId: ctx.tenantId, branchId: branch.id } }),
    prisma.attendanceRecord.count({ where: { tenantId: ctx.tenantId, branchId: branch.id } }),
    prisma.employmentHistory.count({ where: { tenantId: ctx.tenantId, branchId: branch.id } })
  ])
  if (members + employees + attendance + history > 0) {
    throw conflict('Kantor ini masih dipakai (karyawan, riwayat absensi, atau akses tim). Nonaktifkan saja agar riwayatnya tetap tersimpan.')
  }
  await prisma.branch.delete({ where: { id: branch.id } })
  invalidateEntitlements(ctx.tenantId)
  await recordAudit(event, {
    audience: 'tenant', action: 'branch.delete', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: ctx.tenantId, impersonatorId: ctx.impersonatorId, targetType: 'branch', targetId: branch.id,
    metadata: { name: branch.name }
  })
  return { success: true }
}
