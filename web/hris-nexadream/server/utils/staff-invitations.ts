import type { H3Event } from 'h3'
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth-rules'
import { hashPassword, startSession } from '../services/auth'

// Undangan staf back-office (tidak ada registrasi publik untuk /admin).
// Pembuatan undangan ada di /admin/users (fase 8); fase 3 menyediakan pratinjau + terima.

export const acceptStaffInvitationSchema = z.object({
  token: z.string().min(10, 'Tautan undangan tidak valid.'),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`)
})

const EXPIRED = 'Undangan sudah tidak berlaku. Minta undangan baru kepada admin.'

async function findUsableInvitation(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { role: { select: { name: true } }, invitedBy: { select: { name: true } } }
  })
  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    throw httpError(400, 'VALIDATION_FAILED', EXPIRED)
  }
  return invitation
}

export async function previewStaffInvitation(event: H3Event, token: string) {
  await assertSharedRateLimit('staff-invite-preview:ip', clientIp(event), 30, 15 * 60 * 1000)
  const invitation = await findUsableInvitation(token)
  return {
    email: invitation.email,
    name: invitation.name,
    roleName: invitation.role.name,
    inviterName: invitation.invitedBy?.name ?? null,
    expiresAt: invitation.expiresAt.toISOString()
  }
}

export async function acceptStaffInvitation(event: H3Event, input: z.infer<typeof acceptStaffInvitationSchema>) {
  await assertSharedRateLimit('staff-invite-accept:ip', clientIp(event), 20, 15 * 60 * 1000)
  const invitation = await findUsableInvitation(input.token)
  const passwordHash = await hashPassword(input.password)

  const user = await prisma.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null },
      data: { acceptedAt: new Date() }
    })
    if (claimed.count !== 1) throw httpError(400, 'VALIDATION_FAILED', EXPIRED)

    const existing = await tx.user.findUnique({ where: { email: invitation.email } })
    if (existing?.isActive) throw conflict('Email ini sudah memiliki akun staf. Silakan masuk.')
    return existing
      ? tx.user.update({ where: { id: existing.id }, data: { name: input.name, passwordHash, roleId: invitation.roleId, isActive: true } })
      : tx.user.create({ data: { name: input.name, email: invitation.email, passwordHash, roleId: invitation.roleId } })
  })

  await recordAudit(event, {
    audience: 'platform',
    action: 'user.invite_accept',
    actorId: user.id,
    actorName: user.name,
    targetType: 'user',
    targetId: user.id
  })
  return startSession(user.id, 'platform')
}
