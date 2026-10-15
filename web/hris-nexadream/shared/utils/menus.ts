// Pohon menu /admin bawaan (di-seed ke tabel menus, id deterministik menu-{slug})
// dan navigasi konsol perusahaan (TENANT_NAV, berbasis kode).
import type { PermissionKey } from './permissions'
import type { TenantAbility } from './tenant-abilities'
import type { FeatureKey } from './plans'

export interface MenuNode {
  slug: string
  label: string
  path?: string
  icon?: string
  permissionKey?: PermissionKey
  children?: MenuNode[]
}

export const MENU_TREE: MenuNode[] = [
  {
    slug: 'business',
    label: 'Bisnis',
    children: [
      { slug: 'tenants', label: 'Perusahaan', path: '/admin/tenants', icon: 'i-lucide-building-2', permissionKey: 'tenants.read' },
      { slug: 'subscriptions', label: 'Langganan', path: '/admin/subscriptions', icon: 'i-lucide-repeat', permissionKey: 'subscriptions.read' },
      { slug: 'plans', label: 'Paket', path: '/admin/plans', icon: 'i-lucide-package', permissionKey: 'plans.read' },
      { slug: 'payments', label: 'Pembayaran', path: '/admin/payments', icon: 'i-lucide-receipt', permissionKey: 'payments.read' },
      { slug: 'payment-gateways', label: 'Payment gateway', path: '/admin/payment-gateways', icon: 'i-lucide-credit-card', permissionKey: 'payments.write' },
      { slug: 'webhook-events', label: 'Payment callback', path: '/admin/webhook-events', icon: 'i-lucide-webhook', permissionKey: 'payments.read' }
    ]
  },
  {
    slug: 'content',
    label: 'Konten',
    children: [
      { slug: 'pages', label: 'Halaman', path: '/admin/pages', icon: 'i-lucide-file-text', permissionKey: 'pages.read' },
      { slug: 'faq', label: 'FAQ', path: '/admin/faq', icon: 'i-lucide-circle-help', permissionKey: 'faq.read' },
      { slug: 'messages', label: 'Pesan masuk', path: '/admin/messages', icon: 'i-lucide-inbox', permissionKey: 'messages.read' },
      { slug: 'email-templates', label: 'Templat email', path: '/admin/email-templates', icon: 'i-lucide-mail', permissionKey: 'email-templates.read' },
      { slug: 'notification-templates', label: 'Templat notifikasi', path: '/admin/notification-templates', icon: 'i-lucide-bell', permissionKey: 'notification-templates.read' },
      { slug: 'scheduled-notifications', label: 'Notifikasi terjadwal', path: '/admin/scheduled-notifications', icon: 'i-lucide-calendar-clock', permissionKey: 'scheduled-notifications.read' }
    ]
  },
  {
    slug: 'access',
    label: 'Akses',
    children: [
      {
        slug: 'people',
        label: 'Pengguna',
        icon: 'i-lucide-users',
        children: [
          { slug: 'users', label: 'Staf', path: '/admin/users', icon: 'i-lucide-user-cog', permissionKey: 'users.read' },
          { slug: 'tenant-users', label: 'Pengguna perusahaan', path: '/admin/tenant-users', icon: 'i-lucide-user', permissionKey: 'tenants.read' }
        ]
      },
      { slug: 'roles', label: 'Peran', path: '/admin/roles', icon: 'i-lucide-shield', permissionKey: 'roles.read' },
      { slug: 'permissions', label: 'Hak akses', path: '/admin/permissions', icon: 'i-lucide-key-round', permissionKey: 'permissions.read' },
      { slug: 'menus', label: 'Menu', path: '/admin/menus', icon: 'i-lucide-list-tree', permissionKey: 'menus.read' },
      { slug: 'api-clients', label: 'API key', path: '/admin/api-clients', icon: 'i-lucide-key', permissionKey: 'api-clients.read' }
    ]
  },
  {
    slug: 'system',
    label: 'Sistem',
    children: [
      { slug: 'settings', label: 'Pengaturan', path: '/admin/settings', icon: 'i-lucide-settings', permissionKey: 'settings.read' },
      { slug: 'reference-data', label: 'Data referensi', path: '/admin/reference-data', icon: 'i-lucide-scale', permissionKey: 'reference-data.read' },
      { slug: 'audit-logs', label: 'Log aktivitas', path: '/admin/audit-logs', icon: 'i-lucide-scroll-text', permissionKey: 'settings.read' },
      { slug: 'system-status', label: 'Kesiapan produksi', path: '/admin/system', icon: 'i-lucide-rocket', permissionKey: 'settings.read' }
    ]
  }
]

export interface FlatMenuRow {
  id: string
  parentId: string | null
  slug: string
  label: string
  path: string | null
  icon: string | null
  permissionKey: string | null
  order: number
}

export function menuId(slug: string): string {
  return `menu-${slug}`
}

export function flattenMenuTree(nodes: MenuNode[] = MENU_TREE, parentId: string | null = null): FlatMenuRow[] {
  return nodes.flatMap((node, index) => [
    {
      id: menuId(node.slug),
      parentId,
      slug: node.slug,
      label: node.label,
      path: node.path ?? null,
      icon: node.icon ?? null,
      permissionKey: node.permissionKey ?? null,
      order: index
    },
    ...flattenMenuTree(node.children ?? [], menuId(node.slug))
  ])
}

export interface TenantNavItem {
  label: string
  to: string
  icon: string
  /** Menyembunyikan entri bila peran tidak punya kemampuan ini. */
  ability?: TenantAbility
  /** TIDAK menyembunyikan; menampilkan gembok dan membuka dialog upgrade. */
  feature?: FeatureKey
}

/** Navigasi konsol manajemen (owner, hr_admin, manager). */
export const TENANT_NAV: TenantNavItem[] = [
  { label: 'Dashboard', to: '/app/dashboard', icon: 'i-lucide-layout-dashboard' },
  { label: 'Persetujuan', to: '/app/approvals', icon: 'i-lucide-inbox', ability: 'leave.approve' },
  { label: 'Karyawan', to: '/app/employees', icon: 'i-lucide-users', ability: 'employees.read' },
  { label: 'Organisasi', to: '/app/organization', icon: 'i-lucide-network', ability: 'employees.write' },
  { label: 'Kehadiran', to: '/app/attendance', icon: 'i-lucide-clock', ability: 'attendance.read' },
  { label: 'Shift & jadwal', to: '/app/shifts', icon: 'i-lucide-calendar-range', ability: 'attendance.write' },
  { label: 'Cuti', to: '/app/leave', icon: 'i-lucide-plane', ability: 'leave.read', feature: 'leaveManagement' },
  { label: 'Lembur', to: '/app/overtime', icon: 'i-lucide-timer', ability: 'overtime.read', feature: 'overtime' },
  { label: 'Reimbursement', to: '/app/reimbursements', icon: 'i-lucide-receipt', ability: 'reimbursement.read', feature: 'reimbursement' },
  { label: 'Payroll', to: '/app/payroll', icon: 'i-lucide-wallet', ability: 'payroll.read', feature: 'payroll' },
  { label: 'Dokumen', to: '/app/documents', icon: 'i-lucide-folder-lock', ability: 'documents.read', feature: 'documentVault' },
  { label: 'Kinerja', to: '/app/performance', icon: 'i-lucide-target', ability: 'performance.read', feature: 'performanceReview' },
  { label: 'Laporan', to: '/app/reports', icon: 'i-lucide-chart-column', ability: 'reports.read' },
  { label: 'Layanan saya', to: '/app/me', icon: 'i-lucide-user-round', ability: 'self.profile' },
  { label: 'Tim & Akses', to: '/app/team', icon: 'i-lucide-user-plus', ability: 'team.manage' },
  { label: 'Pengaturan', to: '/app/settings', icon: 'i-lucide-settings', ability: 'settings.manage' },
  { label: 'Langganan', to: '/app/billing', icon: 'i-lucide-credit-card', ability: 'billing.manage' }
]

/** Navigasi layanan mandiri karyawan (ESS). Lima pertama = tab bawah di ponsel. */
export const ESS_NAV: TenantNavItem[] = [
  { label: 'Beranda', to: '/app/me', icon: 'i-lucide-house' },
  { label: 'Absensi', to: '/app/me/attendance', icon: 'i-lucide-clock', ability: 'attendance.self' },
  { label: 'Cuti', to: '/app/me/leave', icon: 'i-lucide-plane', ability: 'leave.self' },
  { label: 'Slip Gaji', to: '/app/me/payslips', icon: 'i-lucide-file-text', ability: 'payslips.read.own' },
  { label: 'Pengajuan', to: '/app/me/requests', icon: 'i-lucide-list-checks', ability: 'overtime.self' },
  { label: 'Dokumen', to: '/app/me/documents', icon: 'i-lucide-folder-lock', ability: 'documents.self' },
  { label: 'Kinerja', to: '/app/me/performance', icon: 'i-lucide-target', ability: 'performance.self' },
  { label: 'Profil', to: '/app/me/profile', icon: 'i-lucide-user', ability: 'self.profile' }
]

/** Path yang boleh dibuka peran employee; selain ini dialihkan ke /app/me. */
export function isEssAllowedPath(path: string): boolean {
  return path === '/app/me'
    || path.startsWith('/app/me/')
    || ['/app/notifications', '/app/profile', '/app/change-password', '/app/about'].includes(path)
}
