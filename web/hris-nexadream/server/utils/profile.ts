import type { H3Event } from 'h3'
import { z } from 'zod'
import { isValidIndonesianPhone, normalizeIndonesianPhone } from '#shared/utils/phone'

// Profil sendiri (login tenant). Email tidak diubah di sini (identitas masuk & undangan).

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(80, 'Nama terlalu panjang.'),
  phone: z.string().trim().refine(v => v === '' || isValidIndonesianPhone(v), 'Masukkan nomor HP Indonesia yang valid.').optional()
})

export async function updateTenantProfile(event: H3Event, input: z.infer<typeof profileUpdateSchema>) {
  const ctx = await requireTenantContext(event)
  let phone: string | null | undefined
  if (input.phone !== undefined) {
    phone = input.phone ? normalizeIndonesianPhone(input.phone) : null
    // Pemilik wajib punya nomor HP (dipakai untuk masuk dan dihubungi).
    if (!phone && ctx.role === 'owner') throw httpError(400, 'VALIDATION_FAILED', 'Nomor HP pemilik wajib diisi.', { field: 'phone' })
    if (phone) {
      const taken = await prisma.tenantUser.findFirst({ where: { phone, NOT: { id: ctx.user.id } }, select: { id: true } })
      if (taken) throw conflict('Nomor HP ini sudah dipakai akun lain.', { field: 'phone' })
    }
  }
  await prisma.tenantUser.update({
    where: { id: ctx.user.id },
    data: { name: input.name, ...(phone !== undefined ? { phone } : {}) }
  })
  await recordAudit(event, {
    audience: 'tenant', action: 'profile.update', actorId: ctx.user.id, actorName: input.name,
    tenantId: ctx.tenantId, impersonatorId: ctx.impersonatorId, targetType: 'tenant_user', targetId: ctx.user.id
  })
  return { success: true }
}

export async function removeTenantAvatar(event: H3Event) {
  const ctx = await requireTenantContext(event)
  await prisma.tenantUser.update({ where: { id: ctx.user.id }, data: { avatarUrl: null } })
  await retireStoredFiles({ uploadedById: ctx.user.id, purpose: 'avatar', exceptId: '' })
  return { success: true }
}
