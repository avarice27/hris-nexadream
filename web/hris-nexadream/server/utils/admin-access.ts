import type { H3Event } from 'h3'
import { z } from 'zod'
import { PERMISSION_GROUP_LABELS, PERMISSION_KEYS, permissionGroupOf, type PermissionKey } from '#shared/utils/permissions'
import { isValidIndonesianPhone, normalizeIndonesianPhone } from '#shared/utils/phone'
import { formatDateId } from '#shared/utils/format'
import { addDaysToKey, startOfZonedDay, todayKey } from '#shared/utils/timezone'
import type { Prisma } from '~~/generated/prisma/client'

// Back-office: staf, undangan staf, peran, katalog hak akses, editor menu, log audit, login perusahaan.

const listQuery = {
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}
const meta = (page: number, limit: number, total: number) => ({ page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) })

// ---------------------------------------------------------------------------
// Staf
// ---------------------------------------------------------------------------

export const staffListSchema = z.object(listQuery)

export async function listStaff(event: H3Event, query: z.infer<typeof staffListSchema>) {
  await requirePermission(event, 'users.read')
  const where: Prisma.UserWhereInput = query.search
    ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }] }
    : {}
  const [items, total, invitations, roles] = await Promise.all([
    prisma.user.findMany({ where, include: { role: true }, orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.user.count({ where }),
    prisma.invitation.findMany({ where: { acceptedAt: null }, include: { role: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, isSuperAdmin: true } })
  ])
  return {
    items: items.map(u => ({
      id: u.id, name: u.name, email: u.email, phone: u.phone, avatarUrl: u.avatarUrl, isActive: u.isActive,
      role: { id: u.role.id, name: u.role.name, slug: u.role.slug, isSuperAdmin: u.role.isSuperAdmin },
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null, lastSeenAt: u.lastSeenAt?.toISOString() ?? null
    })),
    invitations: invitations.map(i => ({ id: i.id, email: i.email, name: i.name, roleName: i.role.name, expiresAt: i.expiresAt.toISOString(), isExpired: i.expiresAt < new Date() })),
    roles,
    meta: meta(query.page, query.limit, total)
  }
}

export const staffInviteSchema = z.object({
  email: z.email('Masukkan alamat email yang valid.'),
  name: z.string().trim().max(80).optional(),
  roleId: z.string().min(1, 'Pilih peran.')
})

export async function inviteStaff(event: H3Event, input: z.infer<typeof staffInviteSchema>) {
  const ctx = await requirePermission(event, 'users.write')
  const email = input.email.toLowerCase()
  const role = await prisma.role.findUnique({ where: { id: input.roleId } })
  if (!role) throw notFound('Peran tidak ditemukan.')
  if (role.isSuperAdmin && !ctx.isSuperAdmin) throw forbidden('Hanya superadmin yang dapat memberikan peran superadmin.')
  if (await prisma.user.findFirst({ where: { email, isActive: true } })) throw conflict('Email ini sudah menjadi staf aktif.', { field: 'email' })

  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + 7 * 86400_000)
  const invitation = await prisma.$transaction(async (tx) => {
    await tx.invitation.deleteMany({ where: { email, acceptedAt: null } }) // undangan lama mati
    return tx.invitation.create({ data: { email, name: input.name || null, roleId: role.id, tokenHash: sha256(token), invitedById: ctx.user.id, expiresAt } })
  })
  await sendTemplatedEmail({
    to: email,
    templateKey: 'user_invitation',
    params: {
      name: input.name || email, inviterName: ctx.user.name, roleName: role.name,
      inviteUrl: `/admin/auth/accept-invite?token=${token}`, expiresAt: formatDateId(expiresAt, await getSetting('display.timezone'))
    }
  })
  await recordAudit(event, {
    audience: 'platform', action: 'user.invite', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId,
    targetType: 'invitation', targetId: invitation.id, metadata: { email, role: role.slug }
  })
  return { id: invitation.id, email, expiresAt: expiresAt.toISOString() }
}

export async function revokeStaffInvitation(event: H3Event, id: string) {
  const ctx = await requirePermission(event, 'users.write')
  const invitation = await prisma.invitation.findUnique({ where: { id } })
  if (!invitation || invitation.acceptedAt) throw notFound('Undangan tidak ditemukan.')
  await prisma.invitation.delete({ where: { id } })
  await recordAudit(event, { audience: 'platform', action: 'user.invite_revoke', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'invitation', targetId: id, metadata: { email: invitation.email } })
  return { success: true }
}

export const staffUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(80).optional(),
  phone: z.string().trim().refine(v => v === '' || isValidIndonesianPhone(v), 'Masukkan nomor HP yang valid.').nullable().optional(),
  roleId: z.string().optional(),
  isActive: z.boolean().optional()
})

export async function updateStaff(event: H3Event, id: string, input: z.infer<typeof staffUpdateSchema>) {
  const ctx = await requirePermission(event, 'users.write')
  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } })
  if (!target) throw notFound('Staf tidak ditemukan.')
  const isSelf = target.id === ctx.user.id
  if (isSelf && input.isActive === false) throw conflict('Anda tidak bisa menonaktifkan diri sendiri.')
  if (isSelf && input.roleId && input.roleId !== target.roleId) throw conflict('Anda tidak bisa mengubah peran Anda sendiri.')
  if (target.role.isSuperAdmin && !ctx.isSuperAdmin) throw forbidden('Hanya superadmin yang dapat mengubah superadmin.')

  let newRole = null
  if (input.roleId && input.roleId !== target.roleId) {
    newRole = await prisma.role.findUnique({ where: { id: input.roleId } })
    if (!newRole) throw notFound('Peran tidak ditemukan.')
    if (newRole.isSuperAdmin && !ctx.isSuperAdmin) throw forbidden('Hanya superadmin yang dapat memberikan peran superadmin.')
  }
  await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone ? normalizeIndonesianPhone(input.phone) : null } : {}),
      ...(newRole ? { roleId: newRole.id } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
    }
  })
  if (newRole) {
    await recordAudit(event, { audience: 'platform', action: 'role.update', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, targetType: 'user', targetId: id, metadata: { from: target.role.slug, to: newRole.slug } })
  }
  if (input.isActive !== undefined && input.isActive !== target.isActive) {
    await recordAudit(event, { audience: 'platform', action: input.isActive ? 'user.reactivate' : 'user.deactivate', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, targetType: 'user', targetId: id })
  }
  return { success: true }
}

// ---------------------------------------------------------------------------
// Peran & hak akses
// ---------------------------------------------------------------------------

export async function listRoles(event: H3Event) {
  await requirePermission(event, 'roles.read')
  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: { select: { key: true } } } }, _count: { select: { users: true } } },
    orderBy: [{ isSuperAdmin: 'desc' }, { isSystem: 'desc' }, { name: 'asc' }]
  })
  return {
    items: roles.map(r => ({
      id: r.id, slug: r.slug, name: r.name, description: r.description, isSuperAdmin: r.isSuperAdmin, isSystem: r.isSystem,
      userCount: r._count.users, permissions: r.permissions.map(p => p.permission.key)
    })),
    catalog: PERMISSION_KEYS.map(key => ({ key, group: permissionGroupOf(key) })),
    groupLabels: PERMISSION_GROUP_LABELS
  }
}

export const roleSchema = z.object({
  slug: z.string().trim().regex(/^[a-z][a-z0-9_-]{1,30}$/, 'Slug hanya huruf kecil, angka, - dan _.'),
  name: z.string().trim().min(2, 'Nama peran minimal 2 karakter.').max(60),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(z.string()).max(200)
})
export const roleUpdateSchema = roleSchema.partial()

function cleanKeys(keys: string[]): PermissionKey[] {
  return [...new Set(keys)].filter((k): k is PermissionKey => (PERMISSION_KEYS as string[]).includes(k))
}

async function writeRolePermissions(tx: Prisma.TransactionClient, roleId: string, keys: PermissionKey[]) {
  const rows = await tx.permission.findMany({ where: { key: { in: keys } }, select: { id: true } })
  await tx.rolePermission.deleteMany({ where: { roleId } })
  if (rows.length) await tx.rolePermission.createMany({ data: rows.map(p => ({ roleId, permissionId: p.id })) })
}

export async function createRole(event: H3Event, input: z.infer<typeof roleSchema>) {
  const ctx = await requirePermission(event, 'roles.write')
  if (await prisma.role.findUnique({ where: { slug: input.slug } })) throw conflict('Slug peran sudah dipakai.', { field: 'slug' })
  const keys = cleanKeys(input.permissions)
  const role = await prisma.$transaction(async (tx) => {
    const role = await tx.role.create({ data: { slug: input.slug, name: input.name, description: input.description || null } })
    await writeRolePermissions(tx, role.id, keys)
    return role
  })
  await recordAudit(event, { audience: 'platform', action: 'permission.update', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'role', targetId: role.id, metadata: { slug: role.slug, permissions: keys.length } })
  return { id: role.id }
}

export async function updateRole(event: H3Event, id: string, input: z.infer<typeof roleUpdateSchema>) {
  const ctx = await requirePermission(event, 'roles.write')
  const role = await prisma.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } })
  if (!role) throw notFound('Peran tidak ditemukan.')
  if (input.slug && input.slug !== role.slug) {
    if (role.isSystem) throw conflict('Slug peran sistem tidak bisa diubah.')
    if (await prisma.role.findUnique({ where: { slug: input.slug } })) throw conflict('Slug peran sudah dipakai.', { field: 'slug' })
  }
  if (input.permissions && role.isSuperAdmin) throw conflict('Hak akses superadmin tidak bisa diubah.')
  const keys = input.permissions ? cleanKeys(input.permissions) : null
  await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.slug !== undefined && !role.isSystem ? { slug: input.slug } : {})
      }
    })
    if (keys) await writeRolePermissions(tx, id, keys)
  })
  if (keys) {
    const before = new Set(role.permissions.map(p => p.permission.key))
    const after = new Set<string>(keys)
    await recordAudit(event, {
      audience: 'platform', action: 'permission.update', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId,
      targetType: 'role', targetId: id,
      metadata: { role: role.slug, added: [...after].filter(k => !before.has(k)), removed: [...before].filter(k => !after.has(k)) }
    })
  }
  return { success: true }
}

export async function deleteRole(event: H3Event, id: string) {
  const ctx = await requirePermission(event, 'roles.write')
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } })
  if (!role) throw notFound('Peran tidak ditemukan.')
  if (role.isSystem) throw conflict('Peran sistem tidak bisa dihapus.')
  if (role._count.users > 0) throw conflict('Peran ini masih dipakai staf. Pindahkan stafnya terlebih dahulu.')
  await prisma.role.delete({ where: { id } })
  await recordAudit(event, { audience: 'platform', action: 'role.delete', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'role', targetId: id, metadata: { slug: role.slug } })
  return { success: true }
}

export async function listPermissions(event: H3Event) {
  await requirePermission(event, 'permissions.read')
  const rows = await prisma.permission.findMany({ include: { roles: { include: { role: { select: { name: true } } } } }, orderBy: [{ group: 'asc' }, { key: 'asc' }] })
  return { items: rows.map(p => ({ key: p.key, group: p.group, groupLabel: PERMISSION_GROUP_LABELS[p.group as keyof typeof PERMISSION_GROUP_LABELS] ?? p.group, description: p.description, roles: p.roles.map(r => r.role.name) })) }
}

// ---------------------------------------------------------------------------
// Editor menu /admin (pohon maks 3 tingkat)
// ---------------------------------------------------------------------------

export async function listMenus(event: H3Event) {
  await requirePermission(event, 'menus.read')
  const rows = await prisma.menu.findMany({ orderBy: [{ order: 'asc' }, { label: 'asc' }] })
  return { items: rows.map(r => ({ id: r.id, parentId: r.parentId, label: r.label, slug: r.slug, path: r.path, icon: r.icon, permissionKey: r.permissionKey, order: r.order, isActive: r.isActive })), permissionKeys: PERMISSION_KEYS }
}

export const menuSchema = z.object({
  parentId: z.string().nullable().optional(),
  label: z.string().trim().min(1, 'Label wajib diisi.').max(60),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, 'Slug hanya huruf kecil, angka, dan tanda hubung.'),
  path: z.string().trim().regex(/^\/admin(\/[\w\-/:]*)?$/, 'Path harus diawali /admin.').nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  permissionKey: z.string().nullable().optional(),
  order: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional()
})
export const menuUpdateSchema = menuSchema.partial()

async function menuDepth(parentId: string | null | undefined): Promise<number> {
  let depth = 1
  let current = parentId ?? null
  while (current) {
    depth++
    const parent: { parentId: string | null } | null = await prisma.menu.findUnique({ where: { id: current }, select: { parentId: true } })
    current = parent?.parentId ?? null
    if (depth > 4) break
  }
  return depth
}

function validatePermissionKey(key: string | null | undefined) {
  if (key && !(PERMISSION_KEYS as string[]).includes(key)) throw httpError(400, 'VALIDATION_FAILED', 'Hak akses tidak dikenal.', { field: 'permissionKey' })
}

export async function createMenu(event: H3Event, input: z.infer<typeof menuSchema>) {
  const ctx = await requirePermission(event, 'menus.write')
  validatePermissionKey(input.permissionKey)
  if (await prisma.menu.findUnique({ where: { slug: input.slug } })) throw conflict('Slug menu sudah dipakai.', { field: 'slug' })
  if ((await menuDepth(input.parentId)) > 3) throw conflict('Menu maksimal tiga tingkat.')
  const row = await prisma.menu.create({
    data: {
      id: `menu-${input.slug}`, parentId: input.parentId ?? null, label: input.label, slug: input.slug, path: input.path || null,
      icon: input.icon || null, permissionKey: input.permissionKey || null, order: input.order ?? 999, isActive: input.isActive ?? true
    }
  })
  await recordAudit(event, { audience: 'platform', action: 'menu.create', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'menu', targetId: row.id })
  return { id: row.id }
}

export async function updateMenu(event: H3Event, id: string, input: z.infer<typeof menuUpdateSchema>) {
  const ctx = await requirePermission(event, 'menus.write')
  const row = await prisma.menu.findUnique({ where: { id } })
  if (!row) throw notFound('Menu tidak ditemukan.')
  validatePermissionKey(input.permissionKey)
  if (input.slug && input.slug !== row.slug && await prisma.menu.findUnique({ where: { slug: input.slug } })) throw conflict('Slug menu sudah dipakai.', { field: 'slug' })
  if (input.parentId !== undefined && input.parentId !== row.parentId) {
    if (input.parentId === id) throw conflict('Menu tidak bisa menjadi induk dirinya sendiri.')
    if ((await menuDepth(input.parentId)) > 3) throw conflict('Menu maksimal tiga tingkat.')
  }
  await prisma.menu.update({
    where: { id },
    data: {
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.path !== undefined ? { path: input.path || null } : {}),
      ...(input.icon !== undefined ? { icon: input.icon || null } : {}),
      ...(input.permissionKey !== undefined ? { permissionKey: input.permissionKey || null } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
    }
  })
  await recordAudit(event, { audience: 'platform', action: 'menu.update', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'menu', targetId: id })
  return { success: true }
}

export async function deleteMenu(event: H3Event, id: string) {
  const ctx = await requirePermission(event, 'menus.write')
  const row = await prisma.menu.findUnique({ where: { id }, include: { _count: { select: { children: true } } } })
  if (!row) throw notFound('Menu tidak ditemukan.')
  if (row._count.children > 0) throw conflict('Hapus atau pindahkan sub-menunya terlebih dahulu.')
  await prisma.menu.delete({ where: { id } })
  await recordAudit(event, { audience: 'platform', action: 'menu.delete', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'menu', targetId: id, metadata: { slug: row.slug } })
  return { success: true }
}

export const menuReorderSchema = z.object({
  items: z.array(z.object({ id: z.string(), order: z.number().int().min(0).max(1000), parentId: z.string().nullable() })).max(500)
})

export async function reorderMenus(event: H3Event, input: z.infer<typeof menuReorderSchema>) {
  const ctx = await requirePermission(event, 'menus.write')
  await prisma.$transaction(input.items.map(item => prisma.menu.update({ where: { id: item.id }, data: { order: item.order, parentId: item.parentId } })))
  await recordAudit(event, { audience: 'platform', action: 'menu.reorder', actorId: ctx.user.id, actorName: ctx.user.name, metadata: { count: input.items.length } })
  return { success: true }
}

// ---------------------------------------------------------------------------
// Log audit
// ---------------------------------------------------------------------------

export const auditListSchema = z.object({
  ...listQuery,
  action: z.string().trim().max(80).optional(),
  audience: z.enum(['tenant', 'platform']).optional(),
  tenantId: z.string().optional(),
  range: z.enum(['today', '7d', '30d', '90d']).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
})

export async function listAuditLogs(event: H3Event, query: z.infer<typeof auditListSchema>) {
  await requirePermission(event, 'settings.read')
  const tz = await getSetting('display.timezone')
  const today = todayKey(tz)
  const fromKey = query.range ? addDaysToKey(today, ({ 'today': 0, '7d': -6, '30d': -29, '90d': -89 } as const)[query.range]) : query.dateFrom
  const toKey = query.range ? today : query.dateTo
  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.audience ? { audience: query.audience } : {}),
    ...(query.tenantId ? { tenantId: query.tenantId } : {}),
    ...(fromKey || toKey
      ? { createdAt: { ...(fromKey ? { gte: startOfZonedDay(fromKey, tz) } : {}), ...(toKey ? { lt: startOfZonedDay(addDaysToKey(toKey, 1), tz) } : {}) } }
      : {}),
    ...(query.search
      ? { OR: [{ actorName: { contains: query.search, mode: 'insensitive' } }, { action: { contains: query.search, mode: 'insensitive' } }, { targetId: query.search }, { tenant: { name: { contains: query.search, mode: 'insensitive' } } }] }
      : {})
  }
  const [items, total, actions] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { tenant: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } })
  ])
  return {
    items: items.map(a => ({
      id: a.id, audience: a.audience, action: a.action, actorName: a.actorName, impersonatorId: a.impersonatorId,
      tenant: a.tenant, targetType: a.targetType, targetId: a.targetId, metadata: a.metadata, ip: a.ip, userAgent: a.userAgent,
      createdAt: a.createdAt.toISOString()
    })),
    actions: actions.map(a => a.action),
    meta: meta(query.page, query.limit, total)
  }
}

// ---------------------------------------------------------------------------
// Login perusahaan (semua tenant)
// ---------------------------------------------------------------------------

export const tenantUserListSchema = z.object({ ...listQuery, role: z.enum(['owner', 'hr_admin', 'manager', 'employee']).optional() })

export async function listTenantUsers(event: H3Event, query: z.infer<typeof tenantUserListSchema>) {
  await requirePermission(event, 'tenants.read')
  const where: Prisma.TenantUserWhereInput = {
    ...(query.role ? { memberships: { some: { role: query.role } } } : {}),
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }, { memberships: { some: { tenant: { name: { contains: query.search, mode: 'insensitive' } } } } }] }
      : {})
  }
  const [items, total] = await Promise.all([
    prisma.tenantUser.findMany({
      where,
      include: { memberships: { include: { tenant: { select: { id: true, name: true, deletedAt: true } } }, orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit
    }),
    prisma.tenantUser.count({ where })
  ])
  return {
    items: items.map((u) => {
      // Kontak login karyawan disamarkan untuk staf platform (D7).
      const employeeOnly = u.memberships.length > 0 && u.memberships.every(m => m.role === 'employee')
      return {
        id: u.id,
        name: u.name,
        email: employeeOnly ? maskEmail(u.email) : u.email,
        phone: employeeOnly ? (u.phone ? maskIdentifier(u.phone) : null) : u.phone,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
        memberships: u.memberships.map(m => ({ tenantId: m.tenantId, tenantName: m.tenant.name, tenantDeleted: !!m.tenant.deletedAt, role: m.role, isActive: m.isActive }))
      }
    }),
    meta: meta(query.page, query.limit, total)
  }
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`
}

// ---------------------------------------------------------------------------
// Profil staf sendiri
// ---------------------------------------------------------------------------

export const staffProfileSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(80),
  phone: z.string().trim().refine(v => v === '' || isValidIndonesianPhone(v), 'Masukkan nomor HP yang valid.').optional()
})

export async function updateOwnStaffProfile(event: H3Event, input: z.infer<typeof staffProfileSchema>) {
  const ctx = await requirePlatformContext(event)
  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { name: input.name, ...(input.phone !== undefined ? { phone: input.phone ? normalizeIndonesianPhone(input.phone) : null } : {}) }
  })
  return { success: true }
}
