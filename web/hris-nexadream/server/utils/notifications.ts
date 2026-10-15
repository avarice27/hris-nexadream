import type { H3Event } from 'h3'
import { z } from 'zod'
import type { PermissionKey } from '#shared/utils/permissions'
import { NOTIFICATION_LEVELS, NOTIFICATION_TEMPLATES, renderTemplateString, type NotificationLevel, type TemplateVariables } from '#shared/utils/templates'
import { addDaysToKey, startOfZonedDay } from '#shared/utils/timezone'
import type { Prisma } from '~~/generated/prisma/client'
import { dispatchExternal } from '../services/notifications/dispatch'
import type { ChannelOverrides, NotificationAudience, NotificationContext } from '../services/notifications/types'

// Notifikasi in-app (bel) + kanal eksternal. ATURAN D7: judul/isi tidak pernah memuat nilai sensitif.

export interface CreateNotificationInput {
  audience: NotificationAudience
  /** penerima platform */
  userId?: string | null
  /** penerima tenant */
  tenantUserId?: string | null
  tenantId?: string | null
  title?: string
  body?: string
  actionUrl?: string | null
  actionLabel?: string | null
  icon?: string | null
  level?: NotificationLevel
  templateKey?: string
  variables?: TemplateVariables
  channels?: ChannelOverrides
}

/** Templat bel: baris DB aktif → DB; nonaktif/tidak ada → katalog kode. */
async function resolveTemplate(key: string) {
  const row = await prisma.notificationTemplate.findUnique({ where: { key } })
  if (row?.isActive) return row
  return NOTIFICATION_TEMPLATES.find(t => t.key === key) ?? null
}

async function recipientFor(input: CreateNotificationInput) {
  if (input.audience === 'platform' && input.userId) {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { name: true, email: true, isActive: true } })
    return user?.isActive ? { name: user.name, email: user.email } : null
  }
  if (input.audience === 'tenant' && input.tenantUserId) {
    const user = await prisma.tenantUser.findUnique({ where: { id: input.tenantUserId }, select: { name: true, email: true, isActive: true } })
    return user?.isActive ? { name: user.name, email: user.email } : null
  }
  return null
}

async function buildContext(input: CreateNotificationInput): Promise<NotificationContext> {
  if (input.audience === 'platform' && !input.userId) throw new Error('createNotification: platform notification needs userId.')
  if (input.audience === 'tenant' && !input.tenantUserId) throw new Error('createNotification: tenant notification needs tenantUserId.')

  const template = input.templateKey ? await resolveTemplate(input.templateKey) : null
  if (!input.title && !template) throw new Error(`createNotification: no title and unknown template "${input.templateKey}".`)

  const variables: TemplateVariables = { appName: await getSetting('company.name'), ...input.variables }
  const render = (value: string | null | undefined) => value ? renderTemplateString(value, variables) : ''
  const level = input.level ?? (template?.level as NotificationLevel | undefined) ?? 'info'

  return {
    notificationId: null,
    audience: input.audience,
    userId: input.userId ?? null,
    tenantUserId: input.tenantUserId ?? null,
    tenantId: input.tenantId ?? null,
    templateKey: input.templateKey ?? null,
    variables,
    title: input.title ?? render(template?.title),
    body: input.body ?? render(template?.body),
    actionUrl: input.actionUrl ?? (render(template?.actionUrl) || null),
    actionLabel: input.actionLabel ?? (template?.actionLabel ?? null),
    icon: input.icon ?? template?.icon ?? null,
    level: NOTIFICATION_LEVELS.includes(level) ? level : 'info',
    recipient: await recipientFor(input)
  }
}

/**
 * Membuat notifikasi. Field eksplisit menimpa templat. Dengan `tx`, baris bel ditulis di dalam
 * transaksi pemanggil dan kanal eksternal TIDAK dikirim — panggil `deliverNotification(result)`
 * setelah commit (jaringan tidak boleh berada di dalam transaksi).
 */
export async function createNotification(input: CreateNotificationInput, tx?: Prisma.TransactionClient) {
  const ctx = await buildContext(input)
  if (input.channels?.database !== false) {
    const row = await (tx ?? prisma).notification.create({
      data: {
        audience: ctx.audience,
        userId: ctx.userId,
        tenantUserId: ctx.tenantUserId,
        tenantId: ctx.tenantId,
        templateKey: ctx.templateKey,
        title: ctx.title,
        body: ctx.body,
        actionUrl: ctx.actionUrl,
        icon: ctx.icon,
        level: ctx.level
      }
    })
    ctx.notificationId = row.id
  }
  const result = { context: ctx, channels: input.channels ?? {} }
  if (!tx) await deliverNotification(result)
  return result
}

export async function deliverNotification(result: { context: NotificationContext, channels: ChannelOverrides }) {
  await dispatchExternal(result.context, result.channels)
}

/** Kirim ke setiap staf aktif yang perannya memegang izin tersebut (superadmin selalu). Tidak pernah melempar. */
export async function notifyPlatform(permissionKey: PermissionKey, input: Omit<CreateNotificationInput, 'audience' | 'userId'>) {
  try {
    const staff = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: { isSuperAdmin: true } },
          { role: { permissions: { some: { permission: { key: permissionKey } } } } }
        ]
      },
      select: { id: true }
    })
    for (const member of staff) {
      await createNotification({ ...input, audience: 'platform', userId: member.id })
    }
  } catch (error) {
    console.error('[notifications] notifyPlatform failed', permissionKey, error)
  }
}

/** Sama seperti createNotification, tetapi kegagalan ditelan (untuk efek samping setelah commit). */
export async function safeCreateNotification(input: CreateNotificationInput) {
  try {
    await createNotification(input)
  } catch (error) {
    console.error('[notifications] create failed', input.templateKey ?? input.title, error)
  }
}

// ---------------------------------------------------------------------------
// Daftar & tandai dibaca (bel + halaman), satu implementasi per audiens
// ---------------------------------------------------------------------------

export const notificationListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  unreadOnly: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.').optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
})
export type NotificationListQuery = z.infer<typeof notificationListSchema>

/** Lingkup "milik saya" untuk audiens yang sedang masuk. */
async function ownerScope(event: H3Event, audience: NotificationAudience): Promise<Prisma.NotificationWhereInput> {
  if (audience === 'platform') {
    const ctx = await requirePlatformContext(event)
    return { audience: 'platform', userId: ctx.user.id }
  }
  const ctx = await requireTenantContext(event)
  return { audience: 'tenant', tenantUserId: ctx.user.id, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] }
}

function toView(row: { id: string, title: string, body: string, actionUrl: string | null, icon: string | null, level: string, readAt: Date | null, createdAt: Date }) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    actionUrl: row.actionUrl,
    icon: row.icon,
    level: row.level,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  }
}

export async function listNotifications(event: H3Event, audience: NotificationAudience, query: NotificationListQuery) {
  const scope = await ownerScope(event, audience)
  const timezone = audience === 'tenant' ? (await requireTenantContext(event)).tenant.timezone : await getSetting('display.timezone')

  const filters: Prisma.NotificationWhereInput[] = [scope]
  if (query.unreadOnly) filters.push({ readAt: null })
  if (query.search) {
    filters.push({ OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { body: { contains: query.search, mode: 'insensitive' } }] })
  }
  if (query.dateFrom) filters.push({ createdAt: { gte: startOfZonedDay(query.dateFrom, timezone) } })
  if (query.dateTo) filters.push({ createdAt: { lt: startOfZonedDay(addDaysToKey(query.dateTo, 1), timezone) } })
  const where: Prisma.NotificationWhereInput = { AND: filters }

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.notification.count({ where }),
    // unreadCount menghitung SEMUA milik pengguna, bukan hanya halaman yang difilter.
    prisma.notification.count({ where: { AND: [scope, { readAt: null }] } })
  ])
  return {
    items: items.map(toView),
    meta: { page: query.page, limit: query.limit, total, pageCount: Math.max(1, Math.ceil(total / query.limit)) },
    unreadCount
  }
}

export async function markNotificationRead(event: H3Event, audience: NotificationAudience, id: string) {
  const scope = await ownerScope(event, audience)
  const updated = await prisma.notification.updateMany({ where: { AND: [scope, { id, readAt: null }] }, data: { readAt: new Date() } })
  if (updated.count === 0) {
    const exists = await prisma.notification.count({ where: { AND: [scope, { id }] } })
    if (!exists) throw notFound('Notifikasi tidak ditemukan.')
  }
  return { success: true }
}

export async function markAllNotificationsRead(event: H3Event, audience: NotificationAudience) {
  const scope = await ownerScope(event, audience)
  const updated = await prisma.notification.updateMany({ where: { AND: [scope, { readAt: null }] }, data: { readAt: new Date() } })
  return { success: true, updated: updated.count }
}
