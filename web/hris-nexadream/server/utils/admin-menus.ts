import type { H3Event } from 'h3'

export interface AdminMenuNode {
  id: string
  label: string
  slug: string
  path: string | null
  icon: string | null
  children: AdminMenuNode[]
}

/** Sidebar /admin dari tabel menus, dipangkas sesuai hak akses pemanggil. Grup kosong dibuang. */
export async function adminMenusFor(event: H3Event): Promise<AdminMenuNode[]> {
  const context = await requirePlatformContext(event)
  const rows = await prisma.menu.findMany({ where: { isActive: true }, orderBy: [{ order: 'asc' }, { label: 'asc' }] })
  const allowed = (key: string | null) => !key || context.isSuperAdmin || context.permissions.has(key)

  function build(parentId: string | null, depth: number): AdminMenuNode[] {
    if (depth > 3) return []
    return rows
      .filter(row => row.parentId === parentId && allowed(row.permissionKey))
      .map(row => ({
        id: row.id,
        label: row.label,
        slug: row.slug,
        path: row.path,
        icon: row.icon,
        children: build(row.id, depth + 1)
      }))
      .filter(node => node.path !== null || node.children.length > 0)
  }

  return build(null, 1)
}

export async function platformProfile(event: H3Event) {
  const context = await requirePlatformContext(event)
  const { user } = context
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      audience: 'platform' as const,
      role: { id: user.role.id, slug: user.role.slug, name: user.role.name, isSuperAdmin: user.role.isSuperAdmin },
      permissions: [...context.permissions],
      hasPassword: true
    },
    displayTimezone: await getSetting('display.timezone'),
    impersonating: !!context.impersonatorId
  }
}
