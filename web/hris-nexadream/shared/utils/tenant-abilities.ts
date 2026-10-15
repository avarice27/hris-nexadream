// RBAC tenant (perusahaan): empat preset peran, tanpa matriks per pengguna.
// Dipakai identik oleh server dan client. Lihat saas-blueprint/04-rbac.md §2.

export const TENANT_ROLES = ['owner', 'hr_admin', 'manager', 'employee'] as const
export type TenantRoleSlug = (typeof TENANT_ROLES)[number]

export const TENANT_ABILITIES = [
  // Lapisan akun/platform
  'billing.manage',
  'branches.manage',
  'settings.manage',
  'account.manage',
  'team.manage',
  'activity.read',
  'reports.read',
  // Data karyawan
  'employees.read',
  'employees.write',
  'employees.sensitive.read',
  // Kehadiran
  'attendance.read',
  'attendance.write',
  'attendance.self',
  // Cuti
  'leave.read',
  'leave.write',
  'leave.approve',
  'leave.self',
  // Lembur & reimbursement
  'overtime.read',
  'overtime.approve',
  'overtime.self',
  'reimbursement.read',
  'reimbursement.approve',
  'reimbursement.self',
  // Penggajian
  'payroll.read',
  'payroll.write',
  'payslips.read.own',
  // Dokumen & kinerja
  'documents.read',
  'documents.write',
  'documents.self',
  'performance.read',
  'performance.write',
  'performance.self',
  // Profil sendiri
  'self.profile'
] as const
export type TenantAbility = (typeof TENANT_ABILITIES)[number]

/** Kemampuan layanan mandiri (ESS) — "hanya data milik sendiri". */
export const SELF_ABILITIES = [
  'attendance.self',
  'leave.self',
  'overtime.self',
  'reimbursement.self',
  'payslips.read.own',
  'documents.self',
  'performance.self',
  'self.profile'
] as const satisfies readonly TenantAbility[]

/** Kemampuan yang membuka data pribadi (D7): tidak pernah tersirat, setiap baca diaudit. */
export const SENSITIVE_ABILITIES = ['employees.sensitive.read', 'payroll.read'] as const satisfies readonly TenantAbility[]

const HR_ABILITIES: TenantAbility[] = [
  'employees.read', 'employees.write', 'employees.sensitive.read',
  'attendance.read', 'attendance.write',
  'leave.read', 'leave.write', 'leave.approve',
  'overtime.read', 'overtime.approve',
  'reimbursement.read', 'reimbursement.approve',
  'payroll.read', 'payroll.write',
  'documents.read', 'documents.write',
  'performance.read', 'performance.write',
  'reports.read'
]

const ABILITIES: Record<TenantRoleSlug, readonly TenantAbility[]> = {
  owner: TENANT_ABILITIES,
  // Admin HR: semua operasi HR + pengaturan & kantor; tanpa langganan, ekspor/hapus akun, atau tim.
  hr_admin: [...HR_ABILITIES, 'settings.manage', 'branches.manage', ...SELF_ABILITIES],
  // Atasan: persetujuan & data bawahan (dibatasi reportIds); tanpa payroll dan data sensitif.
  manager: [
    'employees.read',
    'attendance.read',
    'leave.read', 'leave.approve',
    'overtime.read', 'overtime.approve',
    'reimbursement.read', 'reimbursement.approve',
    'performance.read', 'performance.write',
    'reports.read',
    ...SELF_ABILITIES
  ],
  // Karyawan: hanya layanan mandiri.
  employee: SELF_ABILITIES
}

const ABILITY_SETS: Record<TenantRoleSlug, ReadonlySet<TenantAbility>> = {
  owner: new Set(ABILITIES.owner),
  hr_admin: new Set(ABILITIES.hr_admin),
  manager: new Set(ABILITIES.manager),
  employee: new Set(ABILITIES.employee)
}

export function isTenantRole(value: unknown): value is TenantRoleSlug {
  return typeof value === 'string' && (TENANT_ROLES as readonly string[]).includes(value)
}

export function canTenantRole(role: TenantRoleSlug | null | undefined, ability: TenantAbility): boolean {
  if (!role) return false
  return ABILITY_SETS[role]?.has(ability) ?? false
}

export function abilitiesFor(role: TenantRoleSlug): TenantAbility[] {
  return [...ABILITIES[role]]
}

export const TENANT_ROLE_PRESETS: Record<TenantRoleSlug, { label: string, summary: string, icon: string }> = {
  owner: {
    label: 'Pemilik',
    summary: 'Akses penuh, termasuk langganan, pembayaran, dan penghapusan perusahaan.',
    icon: 'i-lucide-crown'
  },
  hr_admin: {
    label: 'Admin HR',
    summary: 'Mengelola karyawan, absensi, cuti, dan penggajian. Tidak bisa mengakses langganan.',
    icon: 'i-lucide-user-cog'
  },
  manager: {
    label: 'Atasan / Manajer',
    summary: 'Menyetujui cuti dan lembur serta melihat absensi bawahan. Tidak bisa melihat gaji.',
    icon: 'i-lucide-users'
  },
  employee: {
    label: 'Karyawan',
    summary: 'Layanan mandiri: profil, absensi, cuti, dan slip gaji milik sendiri.',
    icon: 'i-lucide-user'
  }
}

/** Peran yang bisa dipilih di form undangan tim (memakai seat teamMembers). */
export const ASSIGNABLE_TENANT_ROLES: TenantRoleSlug[] = ['hr_admin', 'manager']
/** Karyawan diundang dari rekam karyawan (ESS), bukan dari halaman tim. */
export const ESS_TENANT_ROLE: TenantRoleSlug = 'employee'
/** Peran yang menghabiskan seat teamMembers. */
export const SEAT_TENANT_ROLES: TenantRoleSlug[] = ['owner', 'hr_admin', 'manager']
