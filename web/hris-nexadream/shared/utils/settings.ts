// Katalog pengaturan platform (app_settings). Satu sumber untuk seed, form admin,
// dan fallback getSetting(). Lihat saas-blueprint/10-platform-settings.md.

export type SettingType = 'string' | 'number' | 'boolean' | 'json' | 'secret' | 'text' | 'select'

export const SETTING_GROUPS = ['company', 'smtp', 'billing', 'privacy', 'app', 'hr'] as const
export type SettingGroup = (typeof SETTING_GROUPS)[number]

export interface SettingDef {
  key: string
  group: SettingGroup
  type: SettingType
  label: string
  hint?: string
  default: string
  isSecret?: boolean
  options?: { value: string, label: string }[]
}

export const TIMEZONE_OPTIONS = [
  { value: 'Asia/Jakarta', label: 'WIB (Asia/Jakarta)' },
  { value: 'Asia/Makassar', label: 'WITA (Asia/Makassar)' },
  { value: 'Asia/Jayapura', label: 'WIT (Asia/Jayapura)' }
]
export const TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const
export type SupportedTimezone = (typeof TIMEZONES)[number]

export const SETTING_GROUP_META: Record<SettingGroup, { label: string, description: string, icon: string }> = {
  company: { label: 'Perusahaan', description: 'Identitas yang tampil di situs, email dan faktur.', icon: 'i-lucide-building' },
  smtp: { label: 'Email keluar (SMTP)', description: 'Server pengirim email. Kosongkan host untuk mematikan pengiriman email.', icon: 'i-lucide-mail' },
  billing: { label: 'Penagihan', description: 'Aturan uji coba, masa tenggang dan penurunan paket.', icon: 'i-lucide-credit-card' },
  privacy: { label: 'Privasi & data', description: 'Kebijakan penyimpanan data pelanggan.', icon: 'i-lucide-shield-check' },
  app: { label: 'Aplikasi', description: 'Perilaku aplikasi web dan mobile.', icon: 'i-lucide-settings-2' },
  hr: { label: 'Bawaan SDM', description: 'Nilai awal untuk perusahaan baru. Perusahaan dapat mengubahnya sendiri.', icon: 'i-lucide-users' }
}

export const SETTINGS_CATALOG: SettingDef[] = [
  // company — identitas Nexadream sebagai vendor platform
  { key: 'company.name', group: 'company', type: 'string', label: 'Nama aplikasi', default: 'HRIS Nexadream' },
  { key: 'company.tagline', group: 'company', type: 'string', label: 'Tagline', default: 'Kelola karyawan, absensi, cuti, dan penggajian dalam satu tempat' },
  { key: 'company.legalName', group: 'company', type: 'string', label: 'Nama badan hukum', hint: 'Dicetak pada faktur langganan.', default: '' },
  { key: 'company.siteUrl', group: 'company', type: 'string', label: 'URL situs', hint: 'Dasar tautan absolut di email.', default: 'https://hris.nexadream.id' },
  { key: 'company.email', group: 'company', type: 'string', label: 'Email dukungan', default: 'support@nexadream.id' },
  { key: 'company.phone', group: 'company', type: 'string', label: 'Telepon', default: '' },
  { key: 'company.address', group: 'company', type: 'text', label: 'Alamat', default: '' },
  { key: 'company.whatsapp', group: 'company', type: 'string', label: 'WhatsApp', hint: 'Format 62xxxx. Kosongkan untuk menyembunyikan tombol.', default: '' },
  { key: 'company.logoUrl', group: 'company', type: 'string', label: 'URL logo', default: '' },
  // Kosong = ikon tidak tampil di footer situs.
  { key: 'company.instagramUrl', group: 'company', type: 'string', label: 'Instagram', hint: 'URL lengkap. Kosongkan untuk menyembunyikan.', default: '' },
  { key: 'company.linkedinUrl', group: 'company', type: 'string', label: 'LinkedIn', hint: 'URL lengkap. Kosongkan untuk menyembunyikan.', default: '' },
  { key: 'company.facebookUrl', group: 'company', type: 'string', label: 'Facebook', hint: 'URL lengkap. Kosongkan untuk menyembunyikan.', default: '' },
  { key: 'company.youtubeUrl', group: 'company', type: 'string', label: 'YouTube', hint: 'URL lengkap. Kosongkan untuk menyembunyikan.', default: '' },
  { key: 'company.playStoreUrl', group: 'company', type: 'string', label: 'Google Play', hint: 'Tautan aplikasi mobile. Kosongkan selama belum ada.', default: '' },

  // smtp
  { key: 'smtp.host', group: 'smtp', type: 'string', label: 'Host', default: '' },
  { key: 'smtp.port', group: 'smtp', type: 'number', label: 'Port', default: '587' },
  { key: 'smtp.secure', group: 'smtp', type: 'boolean', label: 'TLS langsung (port 465)', default: 'false' },
  { key: 'smtp.user', group: 'smtp', type: 'string', label: 'Pengguna', default: '' },
  { key: 'smtp.password', group: 'smtp', type: 'secret', label: 'Kata sandi', default: '', isSecret: true },
  { key: 'smtp.fromName', group: 'smtp', type: 'string', label: 'Nama pengirim', default: 'HRIS Nexadream' },
  { key: 'smtp.fromEmail', group: 'smtp', type: 'string', label: 'Email pengirim', default: 'support@nexadream.id' },

  // billing
  { key: 'billing.gracePeriodDays', group: 'billing', type: 'number', label: 'Masa tenggang (hari)', default: '3' },
  { key: 'billing.trialReminderDays', group: 'billing', type: 'number', label: 'Pengingat akhir uji coba (hari)', default: '3' },
  { key: 'billing.trialPlanSlug', group: 'billing', type: 'string', label: 'Paket uji coba', default: 'business' },
  { key: 'billing.defaultPlanSlug', group: 'billing', type: 'string', label: 'Paket bawaan setelah turun', default: 'free' },
  { key: 'billing.oneTrialPerEmail', group: 'billing', type: 'boolean', label: 'Satu uji coba per email', default: 'true' },
  { key: 'billing.invoiceTaxRatePercent', group: 'billing', type: 'number', label: 'PPN pada faktur (%)', hint: 'Usulan; konfirmasi dengan akuntan.', default: '11' },

  // privacy
  { key: 'privacy.retentionMonths', group: 'privacy', type: 'number', label: 'Retensi data platform (bulan)', default: '24' },
  { key: 'privacy.dataProtectionOfficer', group: 'privacy', type: 'string', label: 'Kontak pelindungan data', default: 'support@nexadream.id' },
  { key: 'privacy.deleteRequestSlaDays', group: 'privacy', type: 'number', label: 'SLA permintaan hapus akun (hari)', default: '30' },
  { key: 'privacy.auditRetentionDays', group: 'privacy', type: 'number', label: 'Retensi log audit (hari)', default: '90' },
  { key: 'privacy.sensitiveAuditRetentionDays', group: 'privacy', type: 'number', label: 'Retensi log akses data sensitif (hari)', default: '365' },
  { key: 'privacy.backupRetentionDays', group: 'privacy', type: 'number', label: 'Retensi cadangan (hari)', default: '30' },
  { key: 'privacy.financialRetentionYears', group: 'privacy', type: 'number', label: 'Retensi catatan keuangan & pajak (tahun)', hint: 'Perlu tinjauan hukum.', default: '10' },

  // app
  { key: 'app.minimumMobileVersion', group: 'app', type: 'string', label: 'Versi aplikasi mobile minimum', default: '1.0.0' },
  { key: 'app.internalApiDocsEnabled', group: 'app', type: 'boolean', label: 'Tampilkan dokumentasi API internal', hint: 'Membuka /internal/api (semua endpoint v1). Bukan batas keamanan.', default: 'false' },
  { key: 'app.apiKeysEnabled', group: 'app', type: 'boolean', label: 'Fitur API key perusahaan aktif', hint: 'Tombol darurat: matikan untuk menolak semua API key tanpa rilis ulang.', default: 'true' },
  { key: 'app.maintenanceMode', group: 'app', type: 'boolean', label: 'Mode pemeliharaan', default: 'false' },
  { key: 'app.maintenanceMessage', group: 'app', type: 'text', label: 'Pesan pemeliharaan', default: 'Kami sedang melakukan pemeliharaan. Silakan coba lagi beberapa saat lagi.' },
  { key: 'app.registrationOpen', group: 'app', type: 'boolean', label: 'Pendaftaran dibuka', default: 'true' },
  { key: 'app.contactRateLimitPerHour', group: 'app', type: 'number', label: 'Batas formulir kontak per jam', default: '5' },
  { key: 'display.timezone', group: 'app', type: 'select', label: 'Zona waktu back-office', default: 'Asia/Jakarta', options: TIMEZONE_OPTIONS },

  // hr — nilai awal untuk perusahaan baru
  { key: 'hr.defaultTimezone', group: 'hr', type: 'select', label: 'Zona waktu kantor bawaan', default: 'Asia/Jakarta', options: TIMEZONE_OPTIONS },
  {
    key: 'hr.defaultWorkdaysPerWeek',
    group: 'hr',
    type: 'select',
    label: 'Hari kerja per minggu',
    default: '5',
    options: [{ value: '5', label: '5 hari' }, { value: '6', label: '6 hari' }]
  },
  { key: 'hr.defaultWorkStart', group: 'hr', type: 'string', label: 'Jam mulai kerja', default: '08:00' },
  { key: 'hr.defaultWorkEnd', group: 'hr', type: 'string', label: 'Jam selesai kerja', default: '17:00' },
  {
    key: 'hr.defaultLeavePolicyTemplate',
    group: 'hr',
    type: 'json',
    label: 'Templat kebijakan cuti',
    default: JSON.stringify([
      { code: 'annual', name: 'Cuti tahunan', days: 12, eligibleAfterMonths: 12 },
      { code: 'sick', name: 'Sakit (dengan surat dokter)', days: null, eligibleAfterMonths: 0 },
      { code: 'maternity', name: 'Cuti melahirkan', days: 90, eligibleAfterMonths: 0 },
      { code: 'marriage', name: 'Cuti menikah', days: 3, eligibleAfterMonths: 0 },
      { code: 'bereavement', name: 'Cuti duka', days: 2, eligibleAfterMonths: 0 }
    ])
  },
  { key: 'hr.defaultPayDay', group: 'hr', type: 'number', label: 'Tanggal gajian bawaan', default: '25' },
  { key: 'hr.attendanceGeofenceRadiusMeters', group: 'hr', type: 'number', label: 'Radius geofence bawaan (meter)', default: '100' }
]

export const SETTINGS_BY_KEY: Record<string, SettingDef> = Object.fromEntries(
  SETTINGS_CATALOG.map(def => [def.key, def])
)

export function settingDefault(key: string): string {
  return SETTINGS_BY_KEY[key]?.default ?? ''
}

export const MASKED_SECRET = '••••••••'
