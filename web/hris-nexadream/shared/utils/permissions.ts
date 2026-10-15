// Katalog hak akses staf platform (/admin). Seed menulis satu baris Permission per key.

export const PERMISSIONS = {
  'dashboard': { read: 'dashboard.read' },
  'tenants': { read: 'tenants.read', write: 'tenants.write' },
  'subscriptions': { read: 'subscriptions.read', write: 'subscriptions.write' },
  'plans': { read: 'plans.read', write: 'plans.write' },
  'payments': { read: 'payments.read', write: 'payments.write' },
  'users': { read: 'users.read', write: 'users.write' },
  'roles': { read: 'roles.read', write: 'roles.write' },
  'permissions': { read: 'permissions.read', write: 'permissions.write' },
  'menus': { read: 'menus.read', write: 'menus.write' },
  'settings': { read: 'settings.read', write: 'settings.write' },
  'reference-data': { read: 'reference-data.read', write: 'reference-data.write' },
  'pages': { read: 'pages.read', write: 'pages.write' },
  'faq': { read: 'faq.read', write: 'faq.write' },
  'messages': { read: 'messages.read', write: 'messages.write' },
  'email-templates': { read: 'email-templates.read', write: 'email-templates.write' },
  'notification-templates': { read: 'notification-templates.read', write: 'notification-templates.write' },
  'scheduled-notifications': { read: 'scheduled-notifications.read', write: 'scheduled-notifications.write' },
  'api-clients': { read: 'api-clients.read', write: 'api-clients.write' },
  'reports': { read: 'reports.read' },
  // Masuk sebagai perusahaan/staf. viewSensitive TIDAK dipegang peran mana pun secara bawaan (D7).
  'impersonation': { use: 'impersonation.use', viewSensitive: 'impersonation.viewSensitive' }
} as const

type PermissionMap = typeof PERMISSIONS
export type PermissionGroup = keyof PermissionMap
export type PermissionKey = { [G in PermissionGroup]: PermissionMap[G][keyof PermissionMap[G]] }[PermissionGroup]

export const PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS)
  .flatMap(group => Object.values(group) as PermissionKey[])

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  'dashboard': 'Dasbor',
  'tenants': 'Perusahaan',
  'subscriptions': 'Langganan',
  'plans': 'Paket',
  'payments': 'Pembayaran',
  'users': 'Pengguna staf',
  'roles': 'Peran',
  'permissions': 'Hak akses',
  'menus': 'Menu',
  'settings': 'Pengaturan',
  'reference-data': 'Data referensi (PPh 21, BPJS, UMK, hari libur)',
  'pages': 'Halaman',
  'faq': 'FAQ',
  'messages': 'Pesan masuk',
  'email-templates': 'Templat email',
  'notification-templates': 'Templat notifikasi',
  'scheduled-notifications': 'Notifikasi terjadwal',
  'api-clients': 'API key',
  'reports': 'Laporan',
  'impersonation': 'Masuk sebagai (impersonate)'
}

export const PERMISSION_ACTION_LABELS: Record<string, string> = {
  read: 'Lihat',
  write: 'Ubah',
  use: 'Gunakan',
  viewSensitive: 'Lihat data sensitif saat'
}

/** Hak yang tidak pernah diberikan otomatis ke peran sistem mana pun — harus dicentang manual. */
export const NEVER_AUTO_GRANTED: PermissionKey[] = ['impersonation.viewSensitive']

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as string[]).includes(value)
}

export function permissionGroupOf(key: PermissionKey): PermissionGroup {
  return key.slice(0, key.lastIndexOf('.')) as PermissionGroup
}

export function describePermission(key: PermissionKey): string {
  const group = permissionGroupOf(key)
  const action = key.slice(key.lastIndexOf('.') + 1)
  return `${PERMISSION_ACTION_LABELS[action] ?? action} ${PERMISSION_GROUP_LABELS[group].toLowerCase()}`
}

/** Peran sistem yang di-seed. Admin tidak boleh memperluas aksesnya sendiri. */
export const SYSTEM_ROLES = [
  {
    slug: 'superadmin',
    name: 'Superadmin',
    description: 'Akses penuh, termasuk impersonasi dan tindakan destruktif.',
    isSuperAdmin: true,
    keys: () => PERMISSION_KEYS.filter(k => !NEVER_AUTO_GRANTED.includes(k))
  },
  {
    slug: 'admin',
    name: 'Admin',
    description: 'Semua akses kecuali mengubah peran, hak akses, dan menu.',
    isSuperAdmin: false,
    keys: () => PERMISSION_KEYS.filter(k => !['roles.write', 'permissions.write', 'menus.write', 'impersonation.use', ...NEVER_AUTO_GRANTED].includes(k))
  },
  {
    slug: 'support',
    name: 'Support',
    description: 'Hanya baca (kecuali laporan pendapatan) dan membalas pesan.',
    isSuperAdmin: false,
    keys: () => [
      ...PERMISSION_KEYS.filter(k => k.endsWith('.read') && k !== 'reports.read' && !k.startsWith('impersonation.')),
      'messages.write' as PermissionKey
    ]
  }
] as const
