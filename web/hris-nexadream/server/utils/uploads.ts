import type { H3Event } from 'h3'
import { EXTENSION_BY_TYPE, UPLOAD_PURPOSES, formatBytes, sniffContentType, stripJpegMetadata, type UploadPurpose } from '#shared/utils/uploads'
import { UNLIMITED } from '#shared/utils/plans'
import { deleteObject, uploadObject } from '../services/storage'

// Unggahan: JANGAN percaya klien. Tipe dari magic bytes, nama file dibuat server,
// EXIF/APPn JPEG dibuang (menghapus GPS dari foto ponsel), kuota storageMb diperiksa.

function generatedName(ext: string): string {
  return `${Date.now().toString(36)}-${randomToken(8)}.${ext}`
}

interface UploadOwner {
  audience: 'tenant' | 'platform'
  tenantId: string | null
  uploadedById: string
}

/** Membaca field multipart `file`, memvalidasi, menyimpan, dan mencatat StoredFile. */
export async function handleUpload(event: H3Event, owner: UploadOwner, purpose: UploadPurpose, prefix: string) {
  const def = UPLOAD_PURPOSES[purpose]
  const allowedTypes: readonly string[] = def.allowedTypes
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.data)
  if (!file?.data?.length) throw httpError(400, 'VALIDATION_FAILED', 'Pilih file untuk diunggah.', { field: 'file' })
  if (file.data.length > def.maxBytes) {
    throw httpError(400, 'VALIDATION_FAILED', `Ukuran file maksimal ${formatBytes(def.maxBytes)}.`, { field: 'file' })
  }

  const contentType = sniffContentType(file.data)
  if (!contentType || !allowedTypes.includes(contentType)) {
    throw httpError(400, 'VALIDATION_FAILED', 'Jenis file tidak didukung. Gunakan JPG, PNG, WebP, atau GIF' + (allowedTypes.includes('application/pdf') ? ', atau PDF.' : '.'), { field: 'file' })
  }
  const body = contentType === 'image/jpeg' ? stripJpegMetadata(new Uint8Array(file.data)) : new Uint8Array(file.data)

  // Kuota penyimpanan hanya untuk file perusahaan.
  if (owner.tenantId) {
    const max = await limit(owner.tenantId, 'storageMb')
    if (max !== UNLIMITED) {
      const usedBytes = await storageUsageBytes(owner.tenantId)
      if (usedBytes + body.length > max * 1024 * 1024) {
        await assertWithinLimit(owner.tenantId, 'storageMb', max) // melempar 402 LIMIT_REACHED
      }
    }
  }

  const path = `${prefix}/${generatedName(EXTENSION_BY_TYPE[contentType]!)}`
  const stored = await uploadObject({ visibility: def.visibility, path, body, contentType })
  const row = await prisma.storedFile.create({
    data: {
      tenantId: owner.tenantId,
      uploadedById: owner.uploadedById,
      audience: owner.audience,
      visibility: def.visibility,
      purpose,
      provider: stored.provider,
      path,
      contentType,
      size: body.length,
      // Nama asli hanya untuk tampilan; tidak pernah dipakai di path.
      originalName: file.filename?.slice(0, 200) ?? null
    }
  })
  if (owner.tenantId) invalidateEntitlements(owner.tenantId)
  return { id: row.id, url: stored.url, size: row.size, contentType, path }
}

/** Tandai file lama terhapus dan hapus objeknya (dipakai saat logo/foto diganti). */
export async function retireStoredFiles(where: { tenantId?: string | null, uploadedById?: string, purpose: string, exceptId: string }) {
  const old = await prisma.storedFile.findMany({
    where: { purpose: where.purpose, deletedAt: null, NOT: { id: where.exceptId }, ...(where.tenantId !== undefined ? { tenantId: where.tenantId } : {}), ...(where.uploadedById ? { uploadedById: where.uploadedById } : {}) }
  })
  if (!old.length) return
  await prisma.storedFile.updateMany({ where: { id: { in: old.map(f => f.id) } }, data: { deletedAt: new Date() } })
  for (const file of old) await deleteObject(file.provider, file.visibility, file.path)
}

// ---------------------------------------------------------------------------
// Penggunaan konkret
// ---------------------------------------------------------------------------

export async function uploadCompanyLogo(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'settings.manage')
  const result = await handleUpload(event, { audience: 'tenant', tenantId: ctx.tenantId, uploadedById: ctx.user.id }, 'company_logo', `tenants/${ctx.tenantId}/branding`)
  await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { logoUrl: result.url } })
  await retireStoredFiles({ tenantId: ctx.tenantId, purpose: 'company_logo', exceptId: result.id })
  await recordAudit(event, {
    audience: 'tenant', action: 'tenant.logo_update', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: ctx.tenantId, impersonatorId: ctx.impersonatorId, targetType: 'tenant', targetId: ctx.tenantId
  })
  return { url: result.url }
}

export async function uploadTenantAvatar(event: H3Event) {
  const ctx = await requireTenantContext(event)
  const result = await handleUpload(event, { audience: 'tenant', tenantId: ctx.tenantId, uploadedById: ctx.user.id }, 'avatar', `tenants/${ctx.tenantId}/avatars`)
  await prisma.tenantUser.update({ where: { id: ctx.user.id }, data: { avatarUrl: result.url } })
  await retireStoredFiles({ uploadedById: ctx.user.id, purpose: 'avatar', exceptId: result.id })
  return { url: result.url }
}

export async function uploadPlatformAvatar(event: H3Event) {
  const ctx = await requirePlatformContext(event)
  const result = await handleUpload(event, { audience: 'platform', tenantId: null, uploadedById: ctx.user.id }, 'avatar', 'platform/avatars')
  await prisma.user.update({ where: { id: ctx.user.id }, data: { avatarUrl: result.url } })
  await retireStoredFiles({ tenantId: null, uploadedById: ctx.user.id, purpose: 'avatar', exceptId: result.id })
  return { url: result.url }
}
