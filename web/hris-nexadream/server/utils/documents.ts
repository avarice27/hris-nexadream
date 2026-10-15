import type { H3Event } from 'h3'
import { z } from 'zod'
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, type DocumentCategory } from '#shared/utils/hr'
import { addDaysToKey, dateKeyToDb, dbDateToKey, isDateKey, todayKey } from '#shared/utils/timezone'
import type { EmployeeDocument, Prisma } from '~~/generated/prisma/client'
import { deleteObject, getSignedObjectUrl } from '../services/storage'

// 11.8 Brankas dokumen: objek PRIVAT, hanya dibuka lewat signed URL ≤ 5 menit yang tidak disimpan.
// Dokumen karyawan dibuka oleh orang lain = baca data sensitif (diaudit, diblokir saat impersonasi).

/** URL bertanda tangan untuk file privat milik tenant. Jangan pernah disimpan atau dicatat. */
export async function signedFileUrl(tenantId: string, fileId: string) {
  const file = await prisma.storedFile.findFirst({ where: { id: fileId, tenantId, deletedAt: null } })
  if (!file) throw notFound('File tidak ditemukan.')
  const url = await getSignedObjectUrl(file.provider, file.path, 300)
  return { url, expiresInSeconds: 300, contentType: file.contentType, name: file.originalName }
}

const SELF_CATEGORIES: DocumentCategory[] = ['identity', 'certificate', 'medical', 'other']

function toView(d: EmployeeDocument & { employee?: { id: string, fullName: string, employeeNumber: string } | null }, file?: { size: number, contentType: string, originalName: string | null }) {
  return {
    id: d.id, category: d.category, categoryLabel: DOCUMENT_CATEGORY_LABELS[d.category as DocumentCategory] ?? d.category, title: d.title,
    expiresAt: d.expiresAt ? dbDateToKey(d.expiresAt) : null, visibleToEmployee: d.visibleToEmployee, createdAt: d.createdAt.toISOString(),
    employee: d.employee ? { id: d.employee.id, fullName: d.employee.fullName, employeeNumber: d.employee.employeeNumber } : null,
    size: file?.size ?? null, contentType: file?.contentType ?? null, fileName: file?.originalName ?? null
  }
}

async function withFiles<T extends EmployeeDocument>(rows: T[]) {
  const files = await prisma.storedFile.findMany({ where: { id: { in: rows.map(r => r.fileId) } }, select: { id: true, size: true, contentType: true, originalName: true } })
  return new Map(files.map(f => [f.id, f]))
}

export const documentListSchema = listQuerySchema.extend({
  employeeId: z.string().optional(),
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  scope: z.enum(['company', 'employee']).optional(),
  expiring: z.coerce.boolean().optional()
})

export async function listDocuments(event: H3Event, query: z.infer<typeof documentListSchema>) {
  const ctx = await requireTenantAbility(event, 'documents.read')
  const scope = await employeeScopeWhere(event, ctx)
  const today = todayKey(ctx.tenant.timezone)
  const where: Prisma.EmployeeDocumentWhereInput = {
    tenantId: ctx.tenantId, deletedAt: null,
    ...(query.scope === 'company' ? { employeeId: null } : query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.scope === 'employee' ? { employeeId: { not: null } } : {}),
    ...(scope.employeeId && query.scope !== 'company' ? { OR: [{ employeeId: scope.employeeId }, { employeeId: null }] } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.expiring ? { expiresAt: { gte: dateKeyToDb(today), lte: dateKeyToDb(addDaysToKey(today, 30)) } } : {}),
    ...(query.search ? { OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { employee: { fullName: { contains: query.search, mode: 'insensitive' } } }] } : {})
  }
  const [rows, total] = await Promise.all([
    prisma.employeeDocument.findMany({ where, include: { employee: { select: { id: true, fullName: true, employeeNumber: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.employeeDocument.count({ where })
  ])
  const files = await withFiles(rows)
  return { items: rows.map(r => toView(r, files.get(r.fileId))), meta: listMeta(query.page, query.limit, total), featureAvailable: await can(ctx.tenantId, 'documentVault') }
}

const uploadFieldsSchema = z.object({
  employeeId: z.string().optional(),
  category: z.enum(DOCUMENT_CATEGORIES),
  title: z.string().trim().min(2, 'Judul minimal 2 karakter.').max(120),
  expiresAt: z.string().optional().refine(v => !v || isDateKey(v), 'Format tanggal harus YYYY-MM-DD.'),
  visibleToEmployee: z.enum(['true', 'false']).optional()
})

async function multipartFields(event: H3Event) {
  const parts = await readMultipartFormData(event)
  const fields: Record<string, string> = {}
  for (const part of parts ?? []) if (part.name && part.name !== 'file' && !part.filename) fields[part.name] = part.data.toString('utf8')
  return parseOrThrow(uploadFieldsSchema, fields)
}

export async function uploadDocument(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'documents.write')
  await requireEntitlement(event, 'documentVault')
  const fields = await multipartFields(event)
  if (fields.employeeId) await requireEmployeeAccess(event, 'documents.write', fields.employeeId)
  else if (fields.category !== 'company') throw httpError(400, 'VALIDATION_FAILED', 'Pilih karyawan atau kategori "Dokumen perusahaan".', { field: 'employeeId' })
  const stored = await handleUpload(event, { audience: 'tenant', tenantId: ctx.tenantId, uploadedById: ctx.user.id }, 'document', `tenants/${ctx.tenantId}/documents/${fields.employeeId ?? 'company'}`)
  const row = await prisma.employeeDocument.create({
    data: { tenantId: ctx.tenantId, employeeId: fields.employeeId ?? null, category: fields.category, title: fields.title, fileId: stored.id, expiresAt: fields.expiresAt ? dateKeyToDb(fields.expiresAt) : null, visibleToEmployee: fields.visibleToEmployee !== 'false', uploadedById: ctx.user.id }
  })
  await recordAudit(event, { audience: 'tenant', action: 'document.upload', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'document', targetId: row.id, metadata: { category: fields.category, employeeId: fields.employeeId ?? null } })
  return { id: row.id }
}

export async function uploadMyDocument(event: H3Event) {
  const { ctx, employee } = await requireOwnEmployee(event, 'documents.self')
  await requireEntitlement(event, 'documentVault')
  const fields = await multipartFields(event)
  if (!SELF_CATEGORIES.includes(fields.category)) throw httpError(400, 'VALIDATION_FAILED', 'Kategori ini hanya bisa diunggah Admin HR.', { field: 'category' })
  const stored = await handleUpload(event, { audience: 'tenant', tenantId: ctx.tenantId, uploadedById: ctx.user.id }, 'document', `tenants/${ctx.tenantId}/documents/${employee.id}`)
  const row = await prisma.employeeDocument.create({
    data: { tenantId: ctx.tenantId, employeeId: employee.id, category: fields.category, title: fields.title, fileId: stored.id, expiresAt: fields.expiresAt ? dateKeyToDb(fields.expiresAt) : null, visibleToEmployee: true, uploadedById: ctx.user.id }
  })
  return { id: row.id }
}

export const documentUpdateSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  expiresAt: dateKeySchema.nullable().optional(),
  visibleToEmployee: z.boolean().optional()
})

export async function updateDocument(event: H3Event, id: string, input: z.infer<typeof documentUpdateSchema>) {
  const ctx = await requireTenantAbility(event, 'documents.write')
  const doc = await prisma.employeeDocument.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } })
  if (!doc) throw notFound('Dokumen tidak ditemukan.')
  if (doc.employeeId) await requireEmployeeAccess(event, 'documents.write', doc.employeeId)
  await prisma.employeeDocument.update({ where: { id }, data: { title: input.title, category: input.category, visibleToEmployee: input.visibleToEmployee, expiresAt: input.expiresAt === undefined ? undefined : (input.expiresAt ? dateKeyToDb(input.expiresAt) : null) } })
  await recordAudit(event, { audience: 'tenant', action: 'document.update', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'document', targetId: id })
  return { success: true }
}

export async function deleteDocument(event: H3Event, id: string) {
  const ctx = await requireTenantAbility(event, 'documents.write')
  const doc = await prisma.employeeDocument.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } })
  if (!doc) throw notFound('Dokumen tidak ditemukan.')
  if (doc.employeeId) await requireEmployeeAccess(event, 'documents.write', doc.employeeId)
  const file = await prisma.storedFile.findUnique({ where: { id: doc.fileId } })
  await prisma.$transaction([
    prisma.employeeDocument.update({ where: { id }, data: { deletedAt: new Date() } }),
    prisma.storedFile.update({ where: { id: doc.fileId }, data: { deletedAt: new Date() } })
  ])
  if (file) await deleteObject(file.provider, file.visibility, file.path)
  invalidateEntitlements(ctx.tenantId)
  await recordAudit(event, { audience: 'tenant', action: 'document.delete', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'document', targetId: id, metadata: { title: doc.title } })
  return { success: true }
}

/** Buka dokumen: HR dalam cakupan, karyawan untuk miliknya (yang terlihat) & dokumen perusahaan. */
export async function documentUrl(event: H3Event, id: string) {
  const ctx = await requireTenantContext(event)
  const doc = await prisma.employeeDocument.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } })
  if (!doc) throw notFound('Dokumen tidak ditemukan.')
  const me = await ownEmployee(event, ctx)
  const own = !!me && doc.employeeId === me.id
  if (doc.employeeId === null || own) {
    if (!doc.visibleToEmployee && !canTenantRole(ctx.role, 'documents.read')) throw notFound('Dokumen tidak ditemukan.')
  } else {
    await requireEmployeeAccess(event, 'documents.read', doc.employeeId)
    await auditSensitiveRead(event, ctx, { employeeId: doc.employeeId, fieldGroup: 'document' })
  }
  return signedFileUrl(ctx.tenantId, doc.fileId)
}

export async function myDocuments(event: H3Event) {
  const { ctx, employee } = await requireOwnEmployee(event, 'documents.self')
  const rows = await prisma.employeeDocument.findMany({
    where: { tenantId: ctx.tenantId, deletedAt: null, visibleToEmployee: true, OR: [{ employeeId: employee.id }, { employeeId: null }] },
    orderBy: { createdAt: 'desc' },
    take: 100
  })
  const files = await withFiles(rows)
  return { items: rows.map(r => toView(r, files.get(r.fileId))), featureAvailable: await can(ctx.tenantId, 'documentVault'), selfCategories: SELF_CATEGORIES }
}

/** Cron harian: ringkasan kontrak/masa percobaan/dokumen yang berakhir ≤ 30 hari ke Pemilik & Admin HR. */
export async function sendExpiryReminders(now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  if (!(await claimSettingValue('cron.expiryReminderRanOn', today))) return { skipped: 'already ran today' }
  const until = dateKeyToDb(addDaysToKey(today, 30))
  const from = dateKeyToDb(today)
  const [contracts, probations, docs] = await Promise.all([
    prisma.employee.groupBy({ by: ['tenantId'], where: { status: { notIn: ['terminated', 'inactive'] }, contractEndDate: { gte: from, lte: until } }, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ['tenantId'], where: { status: 'probation', probationEndDate: { gte: from, lte: until } }, _count: { _all: true } }),
    prisma.employeeDocument.groupBy({ by: ['tenantId'], where: { deletedAt: null, expiresAt: { gte: from, lte: until } }, _count: { _all: true } })
  ])
  const perTenant = new Map<string, number>()
  for (const list of [contracts, probations, docs]) for (const row of list) perTenant.set(row.tenantId, (perTenant.get(row.tenantId) ?? 0) + row._count._all)
  let notified = 0
  for (const [tenantId, count] of perTenant) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, deletedAt: true, status: true } })
    if (!tenant || tenant.deletedAt || tenant.status !== 'active') continue
    const members = await prisma.tenantMembership.findMany({ where: { tenantId, isActive: true, role: { in: ['owner', 'hr_admin'] } }, include: { tenantUser: { select: { id: true, name: true } } } })
    for (const m of members) {
      await safeCreateNotification({ audience: 'tenant', tenantId, tenantUserId: m.tenantUser.id, templateKey: 'contract_expiring', variables: { name: m.tenantUser.name, tenantName: tenant.name, count: String(count), days: '30', contractsUrl: '/app/employees?contract=expiring' } })
      notified++
    }
  }
  return { tenants: perTenant.size, notified }
}
