import type { H3Event } from 'h3'
import { z } from 'zod'

// Siaran terjadwal dari staf ke pengguna perusahaan (bel di aplikasi). Dikirim oleh cron:
// klaim baris (scheduled → sending) dulu agar dua instance tidak mengirim dua kali, lalu sisipkan
// notifikasi per batch. Push (FCM) menyusul bila kredensial tersedia.

export const BROADCAST_AUDIENCES = ['tenant_admins', 'tenant_team', 'all_tenant_users'] as const
const ROLES: Record<(typeof BROADCAST_AUDIENCES)[number], Array<'owner' | 'hr_admin' | 'manager' | 'employee'>> = {
  tenant_admins: ['owner', 'hr_admin'],
  tenant_team: ['owner', 'hr_admin', 'manager'],
  all_tenant_users: ['owner', 'hr_admin', 'manager', 'employee']
}

export const broadcastSchema = z.object({
  title: z.string().trim().min(3, 'Judul minimal 3 karakter.').max(120),
  body: z.string().trim().min(3, 'Isi minimal 3 karakter.').max(500),
  audience: z.enum(BROADCAST_AUDIENCES),
  actionUrl: z.string().trim().regex(/^\/[\w\-/?=&#.]*$/, 'Tautan harus path aplikasi, mis. /app/billing.').nullable().optional(),
  scheduledFor: z.iso.datetime({ offset: true, message: 'Waktu kirim tidak valid.' })
})

export const broadcastListSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) })

export async function listBroadcasts(event: H3Event, query: z.infer<typeof broadcastListSchema>) {
  await requirePermission(event, 'scheduled-notifications.read')
  const [rows, total] = await Promise.all([
    prisma.scheduledNotification.findMany({ orderBy: { scheduledFor: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.scheduledNotification.count()
  ])
  return {
    items: rows.map(r => ({ id: r.id, title: r.title, body: r.body, audience: r.audience, actionUrl: r.actionUrl, scheduledFor: r.scheduledFor.toISOString(), status: r.status, sentAt: r.sentAt?.toISOString() ?? null, recipientCount: r.recipientCount, error: r.error })),
    meta: { page: query.page, limit: query.limit, total, pageCount: Math.max(1, Math.ceil(total / query.limit)) }
  }
}

export async function createBroadcast(event: H3Event, input: z.infer<typeof broadcastSchema>) {
  const ctx = await requirePermission(event, 'scheduled-notifications.write')
  const scheduledFor = new Date(input.scheduledFor)
  if (scheduledFor.getTime() < Date.now() - 60_000) throw httpError(400, 'VALIDATION_FAILED', 'Waktu kirim tidak boleh di masa lalu.', { field: 'scheduledFor' })
  const row = await prisma.scheduledNotification.create({ data: { title: input.title, body: input.body, audience: input.audience, actionUrl: input.actionUrl ?? null, scheduledFor, createdById: ctx.user.id } })
  await recordAudit(event, { audience: 'platform', action: 'broadcast.create', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'scheduled_notification', targetId: row.id, metadata: { audience: input.audience } })
  return { id: row.id }
}

export async function cancelBroadcast(event: H3Event, id: string) {
  const ctx = await requirePermission(event, 'scheduled-notifications.write')
  const { count } = await prisma.scheduledNotification.deleteMany({ where: { id, status: 'scheduled' } })
  if (!count) throw conflict('Hanya siaran yang belum terkirim yang bisa dibatalkan.')
  await recordAudit(event, { audience: 'platform', action: 'broadcast.cancel', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'scheduled_notification', targetId: id })
  return { success: true }
}

/** Cron: kirim siaran yang jatuh tempo (idempoten per baris lewat klaim status). */
export async function dispatchDueBroadcasts(now = new Date()) {
  const due = await prisma.scheduledNotification.findMany({ where: { status: 'scheduled', scheduledFor: { lte: now } }, take: 10 })
  let sent = 0
  for (const b of due) {
    const claimed = await prisma.scheduledNotification.updateMany({ where: { id: b.id, status: 'scheduled' }, data: { status: 'sending' } })
    if (!claimed.count) continue
    try {
      const roles = ROLES[b.audience as keyof typeof ROLES] ?? ROLES.tenant_admins
      const members = await prisma.tenantMembership.findMany({
        where: { isActive: true, role: { in: roles }, tenant: { deletedAt: null, status: 'active' }, tenantUser: { isActive: true } },
        select: { tenantId: true, tenantUserId: true }
      })
      for (let i = 0; i < members.length; i += 1000) {
        await prisma.notification.createMany({
          data: members.slice(i, i + 1000).map(m => ({ audience: 'tenant' as const, tenantId: m.tenantId, tenantUserId: m.tenantUserId, templateKey: 'broadcast', title: b.title, body: b.body, actionUrl: b.actionUrl, icon: 'i-lucide-megaphone', level: 'info' }))
        })
      }
      await prisma.scheduledNotification.update({ where: { id: b.id }, data: { status: 'sent', sentAt: new Date(), recipientCount: members.length } })
      sent++
    } catch (error) {
      await prisma.scheduledNotification.update({ where: { id: b.id }, data: { status: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : String(error) } })
    }
  }
  return { due: due.length, sent }
}
