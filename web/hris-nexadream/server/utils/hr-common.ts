import type { H3Event } from 'h3'
import { z } from 'zod'
import type { TenantAbility } from '#shared/utils/tenant-abilities'
import { APPROVAL_SUBJECTS, DEFAULT_APPROVAL_CHAIN, type ApprovalSubject, type ApproverType } from '#shared/utils/hr'
import { todayKey } from '#shared/utils/timezone'
import type { Employee, Prisma } from '~~/generated/prisma/client'

// Fondasi bersama modul HR (fase 11): cakupan karyawan per peran, kode rekam, pengaturan HR,
// enkripsi data pribadi, dan audit baca data sensitif. Lihat saas-blueprint/18 §2.1.

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional()
})
export type ListQuery = z.infer<typeof listQuerySchema>

export const listMeta = (page: number, limit: number, total: number) => ({ page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) })

export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.')
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:mm.')
export const moneySchema = z.number({ error: 'Masukkan angka.' }).min(0, 'Nilai tidak boleh negatif.').max(10_000_000_000, 'Nilai terlalu besar.')

// ---------------------------------------------------------------------------
// Data pribadi (D7)
// ---------------------------------------------------------------------------

export function encryptHr(value: string | null | undefined): string | null {
  const v = value?.trim()
  return v ? encrypt(v, 'hr') : null
}
export function decryptHr(value: string | null | undefined): string {
  return decrypt(value, 'hr')
}
export function encryptHrJson(value: unknown): string {
  return encrypt(JSON.stringify(value), 'hr')
}
export function decryptHrJson<T>(value: string | null | undefined, fallback: T): T {
  const raw = decryptHr(value)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * Setiap pembacaan data identitas/gaji: blokir saat impersonasi (kecuali hak eksplisit),
 * lalu catat aktor + karyawan + grup field (bukan nilainya).
 */
export async function auditSensitiveRead(event: H3Event, ctx: TenantContext, detail: { employeeId: string, fieldGroup: 'identity' | 'bank' | 'family' | 'salary' | 'payslip' | 'document' | 'attendance_photo' }) {
  // API key tanpa scope `sensitive` tidak pernah membuka data pribadi (dokumen, foto, gaji).
  if (ctx.apiKey && !ctx.apiKey.scopes.includes('sensitive')) {
    throw httpError(403, 'FORBIDDEN', 'API key ini tidak memiliki scope sensitive.', { requiredScope: 'sensitive' })
  }
  await assertSensitiveReadAllowed(event, { fieldGroup: detail.fieldGroup, targetType: 'employee', targetId: detail.employeeId })
  await recordAudit(event, {
    audience: 'tenant', action: detail.fieldGroup === 'salary' || detail.fieldGroup === 'payslip' ? 'salary.read' : 'employee.sensitive_read',
    actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId,
    targetType: 'employee', targetId: detail.employeeId, metadata: { fieldGroup: detail.fieldGroup }
  })
}

// ---------------------------------------------------------------------------
// Cakupan karyawan
// ---------------------------------------------------------------------------

/** Rekam karyawan milik login ini (null bila belum ditautkan). Di-cache per request. */
export async function ownEmployee(event: H3Event, ctx: TenantContext): Promise<Employee | null> {
  if (event.context.ownEmployee !== undefined) return event.context.ownEmployee as Employee | null
  const employee = await prisma.employee.findFirst({ where: { tenantId: ctx.tenantId, tenantUserId: ctx.user.id } })
  event.context.ownEmployee = employee
  return employee
}

/** Untuk rute layanan mandiri (/api/app/me/**): wajib punya rekam karyawan aktif. */
export async function requireOwnEmployee(event: H3Event, ability: TenantAbility) {
  const ctx = await requireTenantAbility(event, ability)
  const employee = await ownEmployee(event, ctx)
  if (!employee || employee.status === 'terminated' || employee.status === 'inactive') {
    throw httpError(403, 'EMPLOYEE_NOT_LINKED', 'Akun Anda belum terhubung ke data karyawan. Hubungi Admin HR perusahaan Anda.')
  }
  return { ctx, employee }
}

/** Peran yang melihat semua karyawan (dalam cakupan kantornya). */
export function seesAllEmployees(ctx: TenantContext): boolean {
  return ctx.role === 'owner' || ctx.role === 'hr_admin'
}

/**
 * Filter Prisma untuk karyawan yang boleh dilihat: owner/hr = semua (dibatasi kantor),
 * manager = bawahan langsung + diri sendiri, employee = diri sendiri.
 */
export async function visibleEmployeesWhere(event: H3Event, ctx: TenantContext): Promise<Prisma.EmployeeWhereInput> {
  const base: Prisma.EmployeeWhereInput = { tenantId: ctx.tenantId, ...branchScopeWhere(ctx) }
  if (seesAllEmployees(ctx)) return base
  const me = await ownEmployee(event, ctx)
  if (!me) return { ...base, id: '__none__' }
  if (ctx.role === 'manager') return { ...base, OR: [{ managerId: me.id }, { id: me.id }] }
  return { ...base, id: me.id }
}

/** Id karyawan yang terlihat — untuk memfilter tabel turunan (absen, cuti …). */
export async function visibleEmployeeIds(event: H3Event, ctx: TenantContext): Promise<string[] | null> {
  if (seesAllEmployees(ctx) && !ctx.branchIds) return null
  const rows = await prisma.employee.findMany({ where: await visibleEmployeesWhere(event, ctx), select: { id: true } })
  return rows.map(r => r.id)
}

/** Filter `employeeId` untuk tabel turunan; {} = tanpa batas. */
export async function employeeScopeWhere(event: H3Event, ctx: TenantContext): Promise<{ employeeId?: { in: string[] } }> {
  const ids = await visibleEmployeeIds(event, ctx)
  return ids === null ? {} : { employeeId: { in: ids } }
}

/** Satu karyawan dalam cakupan; 404 bila milik tenant lain atau di luar cakupan. */
export async function requireEmployeeAccess(event: H3Event, ability: TenantAbility, employeeId: string) {
  const ctx = await requireTenantAbility(event, ability)
  const employee = await prisma.employee.findFirst({ where: { AND: [{ id: employeeId }, await visibleEmployeesWhere(event, ctx)] } })
  if (!employee) throw notFound('Karyawan tidak ditemukan.')
  return { ctx, employee }
}

// ---------------------------------------------------------------------------
// Kode rekam yang dibaca manusia (PREFIX-YYMMDD-NNNN)
// ---------------------------------------------------------------------------

type Db = typeof prisma | Prisma.TransactionClient

export async function nextSequence(db: Db, tenantId: string, prefix: string, period: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ lastValue: number }>>`
    INSERT INTO "document_sequences" ("tenantId", "prefix", "period", "lastValue")
    VALUES (${tenantId}, ${prefix}, ${period}, 1)
    ON CONFLICT ("tenantId", "prefix", "period") DO UPDATE SET "lastValue" = "document_sequences"."lastValue" + 1
    RETURNING "lastValue"`
  return Number(rows[0]!.lastValue)
}

/** Naikkan sekuens NIP otomatis melewati NIP "EMP-n" terbesar yang sudah ada (diisi manual/impor/seed). */
export async function syncEmployeeNumberSequence(db: Db, tenantId: string) {
  await db.$executeRaw`
    INSERT INTO "document_sequences" ("tenantId", "prefix", "period", "lastValue")
    SELECT ${tenantId}, 'EMP', 'all', COALESCE(MAX(CAST(SUBSTRING("employeeNumber" FROM '^EMP-([0-9]{1,9})$') AS INTEGER)), 0)
    FROM "employees" WHERE "tenantId" = ${tenantId}
    ON CONFLICT ("tenantId", "prefix", "period") DO UPDATE SET "lastValue" = GREATEST("document_sequences"."lastValue", EXCLUDED."lastValue")`
}

/** CT-260115-0001 — tanggal dari jam perusahaan. */
export async function nextRecordCode(db: Db, tenantId: string, prefix: string, timezone = 'Asia/Jakarta'): Promise<string> {
  const period = todayKey(timezone).slice(2).replace(/-/g, '')
  const n = await nextSequence(db, tenantId, prefix, period)
  return `${prefix}-${period}-${String(n).padStart(4, '0')}`
}

// ---------------------------------------------------------------------------
// Pengaturan HR per perusahaan
// ---------------------------------------------------------------------------

export async function getHrSettings(tenantId: string) {
  const existing = await prisma.tenantHrSettings.findUnique({ where: { tenantId } })
  if (existing) return existing
  return prisma.tenantHrSettings.upsert({ where: { tenantId }, update: {}, create: { tenantId } })
}

/** Rantai persetujuan efektif; kustom hanya bila fitur customApprovalFlows aktif. */
export async function approvalChainFor(tenantId: string, subject: ApprovalSubject): Promise<ApproverType[]> {
  if (!(await can(tenantId, 'customApprovalFlows'))) return DEFAULT_APPROVAL_CHAIN
  const settings = await getHrSettings(tenantId)
  const chains = (settings.approvalChains ?? {}) as Partial<Record<ApprovalSubject, ApproverType[]>>
  const chain = chains[subject]
  return Array.isArray(chain) && chain.length ? chain.filter(s => s === 'manager' || s === 'hr') : DEFAULT_APPROVAL_CHAIN
}

export const approvalChainsSchema = z.object(Object.fromEntries(
  APPROVAL_SUBJECTS.map(s => [s, z.array(z.enum(['manager', 'hr'])).min(1, 'Minimal satu langkah persetujuan.').max(2)])
) as Record<ApprovalSubject, z.ZodArray<z.ZodEnum<{ manager: 'manager', hr: 'hr' }>>>).partial()

/** Zona waktu kantor karyawan (hari lokal absen/cuti/payroll). */
export async function branchTimezone(branchId: string): Promise<string> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { timezone: true } })
  return branch?.timezone ?? 'Asia/Jakarta'
}

/** Hitungan karyawan untuk batas paket `employees`. */
export async function countedEmployees(tenantId: string): Promise<number> {
  return prisma.employee.count({ where: { tenantId, status: { in: ['active', 'probation', 'on_leave'] } } })
}

/** Ringkasan karyawan untuk daftar/relasi (tanpa data sensitif). */
export const employeeBriefSelect = {
  id: true, fullName: true, employeeNumber: true, photoUrl: true, branchId: true,
  position: { select: { name: true } }, department: { select: { name: true } }
} satisfies Prisma.EmployeeSelect

export function toEmployeeBrief(e: { id: string, fullName: string, employeeNumber: string, photoUrl: string | null, branchId: string, position?: { name: string } | null, department?: { name: string } | null }) {
  return { id: e.id, fullName: e.fullName, employeeNumber: e.employeeNumber, photoUrl: e.photoUrl, branchId: e.branchId, positionName: e.position?.name ?? null, departmentName: e.department?.name ?? null }
}
