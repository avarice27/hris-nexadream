// Katalog kunci paket. Nilai per paket ada di DB (Plan.limits / Plan.features),
// diedit di /admin/plans. Kode hanya mengenal KUNCI. Lihat 06-plans-and-entitlements.md.

export const LIMIT_KEYS = [
  'employees',
  'branches',
  'teamMembers',
  'reportRetentionDays',
  'storageMb'
] as const
export type LimitKey = (typeof LIMIT_KEYS)[number]

export const FEATURE_KEYS = [
  'leaveManagement',
  'shiftScheduling',
  'attendanceGeofence',
  'overtime',
  'reimbursement',
  'payroll',
  'performanceReview',
  'documentVault',
  'export',
  'import',
  'multiBranchRollup',
  'branchScopedRoles',
  'customApprovalFlows',
  'activityLog',
  'apiAccess',
  'prioritySupport'
] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

export type PlanLimits = Record<LimitKey, number>
export type PlanFeatures = Record<FeatureKey, boolean>

export const UNLIMITED = -1

export const LIMIT_META: Record<LimitKey, { label: string, sentence: string, hint: string, unit?: string }> = {
  employees: { label: 'Karyawan aktif', sentence: 'karyawan aktif', hint: 'Jumlah rekam karyawan berstatus aktif, masa percobaan, atau cuti.', unit: 'orang' },
  branches: { label: 'Kantor / cabang', sentence: 'kantor atau cabang aktif', hint: 'Jumlah kantor atau lokasi kerja aktif.' },
  teamMembers: { label: 'Pengguna tim', sentence: 'pengguna tim (Pemilik, Admin HR, Atasan)', hint: 'Login Pemilik, Admin HR, dan Atasan termasuk undangan yang belum diterima. Login karyawan tidak dihitung.' },
  reportRetentionDays: { label: 'Riwayat laporan', sentence: 'hari riwayat laporan', hint: 'Seberapa jauh ke belakang laporan dapat dilihat.', unit: 'hari' },
  storageMb: { label: 'Penyimpanan', sentence: 'MB penyimpanan dokumen', hint: 'Kapasitas dokumen karyawan, slip gaji PDF, dan lampiran.', unit: 'MB' }
}

export const FEATURE_META: Record<FeatureKey, { label: string, hint: string }> = {
  leaveManagement: { label: 'Manajemen cuti', hint: 'Jenis cuti, pengajuan, persetujuan, dan saldo.' },
  shiftScheduling: { label: 'Penjadwalan shift', hint: 'Template shift dan jadwal kerja.' },
  attendanceGeofence: { label: 'Absensi geofence / selfie', hint: 'Absen hanya di area kantor, dengan foto opsional.' },
  overtime: { label: 'Lembur', hint: 'Pengajuan dan perhitungan lembur.' },
  reimbursement: { label: 'Reimbursement', hint: 'Klaim biaya karyawan.' },
  payroll: { label: 'Penggajian & slip gaji', hint: 'Proses gaji, PPh 21, BPJS, dan slip gaji.' },
  performanceReview: { label: 'Penilaian kinerja', hint: 'Siklus penilaian kinerja dasar.' },
  documentVault: { label: 'Brankas dokumen', hint: 'Dokumen perusahaan dan karyawan yang tersimpan privat.' },
  export: { label: 'Ekspor data', hint: 'Unduh data dalam format CSV/XLSX.' },
  import: { label: 'Impor data', hint: 'Unggah data karyawan secara massal.' },
  multiBranchRollup: { label: 'Laporan gabungan semua kantor', hint: 'Satu laporan untuk seluruh kantor.' },
  branchScopedRoles: { label: 'Batasi akses per kantor', hint: 'Batasi pengguna tim ke kantor tertentu.' },
  customApprovalFlows: { label: 'Alur persetujuan kustom', hint: 'Persetujuan bertingkat sesuai kebijakan perusahaan.' },
  activityLog: { label: 'Log aktivitas', hint: 'Jejak aktivitas pengguna di perusahaan Anda.' },
  apiAccess: { label: 'Akses API', hint: 'Integrasi sistem lain dengan API key.' },
  prioritySupport: { label: 'Dukungan prioritas', hint: 'Antrean dukungan yang didahulukan.' }
}

/** Nilai konservatif untuk paket yang dibuat sebelum sebuah kunci ditambahkan. */
export const DEFAULT_LIMITS: PlanLimits = {
  employees: 10,
  branches: 1,
  teamMembers: 1,
  reportRetentionDays: 90,
  storageMb: 100
}

export const DEFAULT_FEATURES: PlanFeatures = Object.fromEntries(
  FEATURE_KEYS.map(key => [key, false])
) as PlanFeatures

export function normalizeLimits(raw: unknown): PlanLimits {
  const result: PlanLimits = { ...DEFAULT_LIMITS }
  if (raw && typeof raw === 'object') {
    for (const key of LIMIT_KEYS) {
      const value = (raw as Record<string, unknown>)[key]
      if (typeof value === 'number' && Number.isFinite(value)) result[key] = Math.trunc(value)
    }
  }
  return result
}

export function normalizeFeatures(raw: unknown): PlanFeatures {
  const result: PlanFeatures = { ...DEFAULT_FEATURES }
  if (raw && typeof raw === 'object') {
    for (const key of FEATURE_KEYS) {
      const value = (raw as Record<string, unknown>)[key]
      if (typeof value === 'boolean') result[key] = value
    }
  }
  return result
}

export function formatLimit(key: LimitKey, value: number): string {
  if (value === UNLIMITED) return 'Tanpa batas'
  const unit = LIMIT_META[key].unit
  const formatted = new Intl.NumberFormat('id-ID').format(value)
  return unit ? `${formatted} ${unit}` : formatted
}

const ALL_OFF = DEFAULT_FEATURES

/**
 * Paket awal (D4). Hanya dipakai oleh seed; setelah itu sumber kebenaran adalah DB.
 * Harga tahunan = 10x bulanan (usulan). Enterprise = harga kustom.
 */
export const SEED_PLANS: Array<{
  slug: string
  name: string
  description: string
  priceMonthly: number
  priceYearly: number
  trialDays: number
  order: number
  limits: PlanLimits
  features: PlanFeatures
}> = [
  {
    slug: 'free',
    name: 'Free',
    description: 'Untuk tim kecil yang baru mulai merapikan data karyawan.',
    priceMonthly: 0,
    priceYearly: 0,
    trialDays: 0,
    order: 0,
    limits: { employees: 10, branches: 1, teamMembers: 1, reportRetentionDays: 90, storageMb: 100 },
    features: { ...ALL_OFF, leaveManagement: true }
  },
  {
    slug: 'growth',
    name: 'Growth',
    description: 'Absensi, cuti, lembur, dan reimbursement untuk perusahaan yang berkembang.',
    priceMonthly: 199000,
    priceYearly: 1990000,
    trialDays: 14,
    order: 1,
    limits: { employees: 50, branches: 3, teamMembers: 3, reportRetentionDays: 365, storageMb: 1024 },
    features: {
      ...ALL_OFF,
      leaveManagement: true,
      shiftScheduling: true,
      attendanceGeofence: true,
      overtime: true,
      reimbursement: true,
      documentVault: true,
      export: true
    }
  },
  {
    slug: 'business',
    name: 'Business',
    description: 'HR lengkap dengan penggajian, PPh 21, dan BPJS untuk banyak kantor.',
    priceMonthly: 599000,
    priceYearly: 5990000,
    trialDays: 14,
    order: 2,
    limits: { employees: 250, branches: 10, teamMembers: 10, reportRetentionDays: 1095, storageMb: 10240 },
    features: {
      ...ALL_OFF,
      leaveManagement: true,
      shiftScheduling: true,
      attendanceGeofence: true,
      overtime: true,
      reimbursement: true,
      payroll: true,
      performanceReview: true,
      documentVault: true,
      export: true,
      import: true,
      multiBranchRollup: true,
      branchScopedRoles: true,
      activityLog: true
    }
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    description: 'Tanpa batas, API, dan dukungan prioritas. Harga sesuai kebutuhan.',
    priceMonthly: 0,
    priceYearly: 0,
    trialDays: 14,
    order: 3,
    limits: { employees: UNLIMITED, branches: UNLIMITED, teamMembers: UNLIMITED, reportRetentionDays: UNLIMITED, storageMb: UNLIMITED },
    features: Object.fromEntries(FEATURE_KEYS.map(key => [key, true])) as PlanFeatures
  }
]

/**
 * Paket berharga kustom ("Hubungi kami"): harga bulanan & tahunan 0 tetapi BUKAN paket gratis,
 * ditandai karyawan tanpa batas. Landing mengarahkan CTA-nya ke #kontak, bukan ke checkout.
 */
export function isCustomPricedPlan(plan: { priceMonthly: number, priceYearly: number, limits: Pick<PlanLimits, 'employees'> }): boolean {
  return plan.priceMonthly === 0 && plan.priceYearly === 0 && plan.limits.employees === UNLIMITED
}

/** Hemat bayar tahunan dibanding 12x bulanan (0 bila tidak hemat). */
export function yearlySaving(plan: { priceMonthly: number, priceYearly: number }): { amount: number, percent: number } {
  const full = plan.priceMonthly * 12
  const amount = full - plan.priceYearly
  if (plan.priceYearly <= 0 || amount <= 0) return { amount: 0, percent: 0 }
  return { amount, percent: Math.round((amount / full) * 100) }
}

/** Fitur yang aktif di paket ini tetapi tidak di paket sebelumnya ("Semua fitur X, plus:"). */
export function addedFeatures(plan: { features: PlanFeatures }, previous?: { features: PlanFeatures }): FeatureKey[] {
  return FEATURE_KEYS.filter(key => plan.features[key] && !previous?.features[key])
}
