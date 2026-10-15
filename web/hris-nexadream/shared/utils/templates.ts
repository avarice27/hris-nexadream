// Katalog templat email & notifikasi bawaan. Kunci berbahasa Inggris; semua teks yang dirender
// berbahasa Indonesia. Admin mengedit salinannya di /admin/email-templates dan
// /admin/notification-templates; kunci tidak dibuat dari UI karena dirujuk oleh kode.
//
// ATURAN KONTEN HRIS (D7): email, bel, dan push TIDAK PERNAH memuat nilai sensitif
// (gaji, NIK, NPWP, rekening, alasan medis). Beri tahu bahwa sesuatu siap, tautkan ke halaman login.

export type TemplateVariable = { token: string, label: string, sample: string }
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface EmailTemplateDef {
  key: string
  name: string
  description: string
  /** Hanya HTML bagian dalam; pembungkus merek ditambahkan saat kirim. */
  subject: string
  body: string
  variables: TemplateVariable[]
}

export interface NotificationTemplateDef {
  key: string
  name: string
  title: string
  body: string
  actionLabel?: string
  actionUrl?: string
  icon?: string
  level: NotificationLevel
  variables: TemplateVariable[]
}

export const NOTIFICATION_LEVELS: NotificationLevel[] = ['info', 'success', 'warning', 'error']

// textClass ditulis lengkap agar terdeteksi Tailwind (kelas dinamik tidak di-generate).
export const NOTIFICATION_LEVEL_META: Record<NotificationLevel, { label: string, color: NotificationLevel, icon: string, textClass: string }> = {
  info: { label: 'Info', color: 'info', icon: 'i-lucide-info', textClass: 'text-info' },
  success: { label: 'Berhasil', color: 'success', icon: 'i-lucide-circle-check', textClass: 'text-success' },
  warning: { label: 'Peringatan', color: 'warning', icon: 'i-lucide-triangle-alert', textClass: 'text-warning' },
  error: { label: 'Penting', color: 'error', icon: 'i-lucide-circle-alert', textClass: 'text-error' }
}

// ---------------------------------------------------------------------------
// Variabel umum
// ---------------------------------------------------------------------------

const v = (token: string, label: string, sample: string): TemplateVariable => ({ token, label, sample })

const NAME = v('name', 'Nama penerima', 'Budi Santoso')
const TENANT = v('tenantName', 'Nama perusahaan', 'PT Maju Bersama')
const PLAN = v('planName', 'Nama paket', 'Business')
const BILLING_URL = v('billingUrl', 'Tautan langganan', '/app/billing')
const APPROVER = v('approverName', 'Nama penyetuju', 'Agus Pratama')
const EMPLOYEE = v('employeeName', 'Nama karyawan', 'Budi Santoso')
const LEAVE_TYPE = v('leaveTypeName', 'Jenis cuti', 'Cuti tahunan')
const START = v('startDate', 'Tanggal mulai', '20 Oktober 2026')
const END = v('endDate', 'Tanggal selesai', '22 Oktober 2026')

/** Disuntikkan ke setiap email: tidak perlu didaftarkan per templat. */
export const COMMON_EMAIL_VARIABLES: TemplateVariable[] = [
  v('appName', 'Nama aplikasi', 'HRIS Nexadream'),
  v('siteUrl', 'URL situs', 'https://hris.nexadream.id'),
  v('supportEmail', 'Email dukungan', 'support@nexadream.id')
]

const button = (url: string, label: string) => `<p><a href="{{${url}}}" class="btn">${label}</a></p>`

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  // — Platform umum —
  {
    key: 'welcome',
    name: 'Selamat datang',
    description: 'Dikirim setelah pemilik perusahaan mendaftar.',
    subject: 'Selamat datang di {{appName}}',
    body: `<p>Halo {{name}},</p><p>Terima kasih telah mendaftarkan <strong>{{tenantName}}</strong> di {{appName}}. Lengkapi pengaturan perusahaan lalu tambahkan karyawan pertama Anda.</p>${button('loginUrl', 'Buka {{appName}}')}`,
    variables: [NAME, TENANT, v('loginUrl', 'Tautan masuk', '/app/auth/login')]
  },
  {
    key: 'password_reset',
    name: 'Atur ulang kata sandi',
    description: 'Permintaan atur ulang kata sandi (kedua audiens).',
    subject: 'Atur ulang kata sandi {{appName}}',
    body: `<p>Halo {{name}},</p><p>Kami menerima permintaan untuk mengatur ulang kata sandi akun {{appName}} Anda.</p>${button('resetUrl', 'Atur ulang kata sandi')}<p>Tautan ini berlaku selama {{expiresInHours}} jam. Abaikan email ini jika Anda tidak memintanya.</p>`,
    variables: [NAME, v('resetUrl', 'Tautan atur ulang', '/app/auth/reset-password?token=abc'), v('expiresInHours', 'Masa berlaku (jam)', '2')]
  },
  {
    key: 'user_invitation',
    name: 'Undangan staf platform',
    description: 'Undangan untuk staf back-office. Berlaku 7 hari.',
    subject: 'Undangan bergabung sebagai staf {{appName}}',
    body: `<p>Halo {{name}},</p><p>{{inviterName}} mengundang Anda bergabung sebagai <strong>{{roleName}}</strong> di back-office {{appName}}.</p>${button('inviteUrl', 'Terima undangan')}<p>Undangan berlaku sampai {{expiresAt}}.</p>`,
    variables: [NAME, v('inviterName', 'Nama pengundang', 'Rafi'), v('roleName', 'Peran', 'Support'), v('inviteUrl', 'Tautan undangan', '/admin/auth/accept-invite?token=abc'), v('expiresAt', 'Batas waktu', '22 Oktober 2026')]
  },
  {
    key: 'tenant_invitation',
    name: 'Undangan tim perusahaan',
    description: 'Undangan Admin HR atau Atasan ke perusahaan. Berlaku 7 hari.',
    subject: '{{inviterName}} mengundang Anda ke {{tenantName}}',
    body: `<p>Halo {{name}},</p><p>{{inviterName}} mengundang Anda bergabung ke <strong>{{tenantName}}</strong> sebagai <strong>{{roleName}}</strong> di {{appName}}.</p>${button('inviteUrl', 'Terima undangan')}<p>Undangan berlaku sampai {{expiresAt}}.</p>`,
    variables: [NAME, v('inviterName', 'Nama pengundang', 'Sari Wijaya'), TENANT, v('roleName', 'Peran', 'Admin HR'), v('inviteUrl', 'Tautan undangan', '/app/auth/accept-invite?token=abc'), v('expiresAt', 'Batas waktu', '22 Oktober 2026')]
  },
  {
    key: 'trial_started',
    name: 'Uji coba dimulai',
    description: 'Uji coba paket diberikan saat pendaftaran.',
    subject: 'Uji coba paket {{planName}} aktif',
    body: `<p>Anda bisa mencoba semua fitur paket <strong>{{planName}}</strong> sampai {{trialEndsAt}}.</p>${button('billingUrl', 'Lihat paket')}`,
    variables: [PLAN, v('trialEndsAt', 'Akhir uji coba', '29 Oktober 2026'), BILLING_URL]
  },
  {
    key: 'trial_ending_soon',
    name: 'Uji coba segera berakhir',
    description: 'Pengingat terjadwal sebelum uji coba berakhir.',
    subject: 'Uji coba {{tenantName}} berakhir {{daysLeft}} hari lagi',
    body: `<p>Uji coba paket {{planName}} untuk <strong>{{tenantName}}</strong> berakhir pada {{trialEndsAt}}. Pilih paket agar fitur tetap aktif.</p>${button('billingUrl', 'Pilih paket')}`,
    variables: [v('daysLeft', 'Sisa hari', '3'), PLAN, TENANT, v('trialEndsAt', 'Akhir uji coba', '29 Oktober 2026'), BILLING_URL]
  },
  {
    key: 'payment_success',
    name: 'Pembayaran berhasil',
    description: 'Pembayaran langganan diterima.',
    subject: 'Pembayaran {{planName}} diterima',
    body: `<p>Terima kasih. Pembayaran <strong>{{amount}}</strong> untuk paket {{planName}} ({{periodLabel}}) atas nama {{tenantName}} sudah kami terima.</p><p>Nomor pesanan: {{orderId}}<br>Aktif sampai: {{periodEnd}}</p>${button('billingUrl', 'Lihat riwayat pembayaran')}`,
    variables: [v('amount', 'Jumlah', 'Rp 599.000'), PLAN, v('periodLabel', 'Periode', 'Bulanan'), v('orderId', 'Nomor pesanan', 'HR-20261015-00042'), v('periodEnd', 'Aktif sampai', '15 November 2026'), TENANT, BILLING_URL]
  },
  {
    key: 'payment_failed',
    name: 'Pembayaran gagal',
    description: 'Pembayaran gagal/kedaluwarsa saat langganan jatuh tempo. Hanya kirim bila graceEndsAt terisi.',
    subject: 'Pembayaran {{tenantName}} belum berhasil',
    body: `<p>Pembayaran <strong>{{amount}}</strong> untuk paket {{planName}} belum berhasil. Selesaikan sebelum <strong>{{graceEndsAt}}</strong> agar fitur tetap aktif.</p>${button('billingUrl', 'Selesaikan pembayaran')}`,
    variables: [v('amount', 'Jumlah', 'Rp 599.000'), PLAN, TENANT, v('graceEndsAt', 'Batas masa tenggang', '18 Oktober 2026'), BILLING_URL]
  },
  {
    key: 'subscription_downgraded',
    name: 'Turun ke paket Free',
    description: 'Langganan berakhir dan perusahaan turun ke paket Free.',
    subject: 'Akun Anda kini memakai paket Free',
    body: `<p>Langganan berbayar Anda telah berakhir sehingga akun kini memakai paket Free. Data Anda tetap aman. Jika jumlah kantor melebihi batas, pilih kantor yang tetap aktif.</p>${button('branchSelectionUrl', 'Atur kantor aktif')}`,
    variables: [v('branchSelectionUrl', 'Tautan pilih kantor', '/app/branches')]
  },
  {
    key: 'tenant_deleted',
    name: 'Akun perusahaan dihapus',
    description: 'Pesan terakhir saat perusahaan dihapus.',
    subject: 'Akun {{tenantName}} telah dihapus',
    body: '<p>Akun perusahaan <strong>{{tenantName}}</strong> telah dihapus pada {{deletedAt}}. Jika ini keliru, hubungi kami di {{supportEmail}}.</p>',
    variables: [TENANT, v('deletedAt', 'Tanggal dihapus', '15 Oktober 2026')]
  },
  {
    key: 'contact_enquiry',
    name: 'Pesan dari formulir kontak',
    description: 'Salinan pesan formulir kontak ke kotak masuk perusahaan.',
    subject: 'Pesan baru: {{subject}}',
    body: '<p><strong>{{name}}</strong> ({{email}}{{#phone}}, {{phone}}{{/phone}}) mengirim pesan:</p><blockquote>{{message}}</blockquote>',
    variables: [NAME, v('email', 'Email', 'budi@example.com'), v('phone', 'Telepon', '6281234567890'), v('subject', 'Subjek', 'Tanya harga Enterprise'), v('message', 'Pesan', 'Halo, kami punya 400 karyawan…')]
  },
  {
    key: 'inactivity_winback',
    name: 'Ajakan kembali',
    description: 'Pemilik tidak aktif selama beberapa hari.',
    subject: 'Kami rindu {{tenantName}}',
    body: `<p>Halo {{name}}, sudah {{days}} hari Anda tidak membuka {{appName}}. Data karyawan dan absensi {{tenantName}} menunggu Anda.</p>${button('appUrl', 'Buka {{appName}}')}`,
    variables: [NAME, TENANT, v('days', 'Jumlah hari', '10'), v('appUrl', 'Tautan aplikasi', '/app/dashboard')]
  },

  // — HRIS —
  {
    key: 'employee_invitation',
    name: 'Undangan layanan mandiri karyawan',
    description: 'Admin HR mengundang karyawan ke layanan mandiri (ESS). Berlaku 7 hari.',
    subject: '{{inviterName}} mengundang Anda ke {{tenantName}} di {{appName}}',
    body: `<p>Halo {{name}},</p><p>{{tenantName}} mengundang Anda mengakses absensi, cuti, dan slip gaji Anda lewat {{appName}}.</p>${button('inviteUrl', 'Aktifkan akun')}<p>Aktifkan sebelum {{expiresAt}}.</p>`,
    variables: [NAME, TENANT, v('inviterName', 'Nama pengundang', 'Dewi Lestari'), v('inviteUrl', 'Tautan undangan', '/app/auth/accept-invite?token=abc'), v('expiresAt', 'Batas waktu', '22 Oktober 2026')]
  },
  {
    key: 'leave_requested',
    name: 'Pengajuan cuti (ke penyetuju)',
    description: 'Karyawan mengajukan cuti; dikirim ke atasan atau Admin HR.',
    subject: 'Pengajuan cuti dari {{employeeName}}',
    body: `<p>Halo {{approverName}},</p><p>{{employeeName}} mengajukan {{leaveTypeName}} selama {{days}} hari ({{startDate}} – {{endDate}}).</p>${button('reviewUrl', 'Tinjau pengajuan')}`,
    variables: [APPROVER, EMPLOYEE, LEAVE_TYPE, START, END, v('days', 'Jumlah hari', '3'), v('reviewUrl', 'Tautan tinjau', '/app/approvals')]
  },
  {
    key: 'leave_approved',
    name: 'Cuti disetujui',
    description: 'Pengajuan cuti disetujui; dikirim ke karyawan.',
    subject: 'Cuti Anda disetujui',
    body: `<p>Halo {{name}},</p><p>Pengajuan {{leaveTypeName}} Anda ({{startDate}} – {{endDate}}) disetujui oleh {{approverName}}.</p>${button('detailUrl', 'Lihat detail')}`,
    variables: [NAME, LEAVE_TYPE, START, END, APPROVER, v('detailUrl', 'Tautan detail', '/app/me/leave')]
  },
  {
    key: 'leave_rejected',
    name: 'Cuti ditolak',
    description: 'Pengajuan cuti ditolak; dikirim ke karyawan.',
    subject: 'Cuti Anda ditolak',
    body: `<p>Halo {{name}},</p><p>Pengajuan {{leaveTypeName}} Anda ({{startDate}} – {{endDate}}) ditolak oleh {{approverName}}.{{#reason}} Alasan: {{reason}}{{/reason}}</p>${button('detailUrl', 'Lihat detail')}`,
    variables: [NAME, LEAVE_TYPE, START, END, APPROVER, v('reason', 'Alasan (opsional)', 'Bertepatan dengan audit akhir bulan'), v('detailUrl', 'Tautan detail', '/app/me/leave')]
  },
  {
    key: 'payslip_published',
    name: 'Slip gaji terbit',
    description: 'Slip gaji periode tersedia. JANGAN memuat nominal apa pun.',
    subject: 'Slip gaji {{periodLabel}} sudah tersedia',
    body: `<p>Halo {{name}},</p><p>Slip gaji periode {{periodLabel}} sudah dapat dilihat. Masuk untuk membukanya.</p>${button('payslipUrl', 'Lihat slip gaji')}`,
    variables: [NAME, v('periodLabel', 'Periode', 'Oktober 2026'), v('payslipUrl', 'Tautan slip gaji', '/app/me/payslips')]
  },
  {
    key: 'attendance_missing',
    name: 'Absensi belum lengkap',
    description: 'Pengingat terjadwal: tidak ada catatan absen pada hari kerja.',
    subject: 'Absensi {{date}} belum lengkap',
    body: `<p>Halo {{name}},</p><p>Kami belum menemukan catatan absen Anda pada {{date}}. Jika ini keliru, ajukan koreksi absensi.</p>${button('attendanceUrl', 'Buka absensi')}`,
    variables: [NAME, v('date', 'Tanggal', '14 Oktober 2026'), v('attendanceUrl', 'Tautan absensi', '/app/me/attendance')]
  },
  {
    key: 'contract_expiring',
    name: 'Kontrak segera berakhir',
    description: 'Ringkasan harian ke Admin HR: kontrak berakhir dalam N hari.',
    subject: '{{count}} kontrak karyawan berakhir dalam {{days}} hari',
    body: `<p>Halo {{name}},</p><p>Ada {{count}} kontrak di {{tenantName}} yang segera berakhir.</p>${button('contractsUrl', 'Lihat daftar kontrak')}`,
    variables: [NAME, TENANT, v('count', 'Jumlah kontrak', '2'), v('days', 'Dalam (hari)', '30'), v('contractsUrl', 'Tautan daftar', '/app/employees?contract=expiring')]
  },
  {
    key: 'overtime_requested',
    name: 'Pengajuan lembur (ke penyetuju)',
    description: 'Karyawan mengajukan lembur.',
    subject: 'Pengajuan lembur dari {{employeeName}}',
    body: `<p>Halo {{approverName}},</p><p>{{employeeName}} mengajukan lembur dan menunggu persetujuan Anda.</p>${button('requestUrl', 'Tinjau pengajuan')}`,
    variables: [APPROVER, EMPLOYEE, v('requestUrl', 'Tautan pengajuan', '/app/approvals')]
  },
  {
    key: 'reimbursement_requested',
    name: 'Pengajuan reimbursement (ke penyetuju)',
    description: 'Karyawan mengajukan klaim biaya.',
    subject: 'Pengajuan reimbursement dari {{employeeName}}',
    body: `<p>Halo {{approverName}},</p><p>{{employeeName}} mengajukan reimbursement dan menunggu persetujuan Anda.</p>${button('requestUrl', 'Tinjau pengajuan')}`,
    variables: [APPROVER, EMPLOYEE, v('requestUrl', 'Tautan pengajuan', '/app/approvals')]
  },
  {
    key: 'request_decided',
    name: 'Keputusan pengajuan',
    description: 'Lembur/reimbursement disetujui atau ditolak; dikirim ke karyawan.',
    subject: 'Pengajuan {{requestTypeLabel}} Anda {{decisionLabel}}',
    body: `<p>Halo {{name}},</p><p>Pengajuan {{requestTypeLabel}} Anda telah <strong>{{decisionLabel}}</strong>.</p>${button('detailUrl', 'Lihat detail')}`,
    variables: [NAME, v('requestTypeLabel', 'Jenis pengajuan', 'lembur'), v('decisionLabel', 'Keputusan', 'disetujui'), v('detailUrl', 'Tautan detail', '/app/me/requests')]
  },
  {
    key: 'approval_requested',
    name: 'Pengajuan menunggu persetujuan',
    description: 'Pengajuan umum (mis. koreksi absen) menunggu keputusan penyetuju.',
    subject: 'Pengajuan {{requestTypeLabel}} dari {{employeeName}}',
    body: `<p>Halo {{approverName}},</p><p>{{employeeName}} mengajukan {{requestTypeLabel}} dan menunggu persetujuan Anda.</p>${button('requestUrl', 'Tinjau pengajuan')}`,
    variables: [APPROVER, EMPLOYEE, v('requestTypeLabel', 'Jenis pengajuan', 'koreksi absen'), v('requestUrl', 'Tautan pengajuan', '/app/approvals')]
  },
  {
    key: 'employee_limit_reached',
    name: 'Batas karyawan tercapai',
    description: 'Jumlah karyawan aktif mencapai batas paket; dikirim ke pemilik.',
    subject: 'Batas {{max}} karyawan {{tenantName}} tercapai',
    body: `<p>Halo {{name}},</p><p>{{tenantName}} sudah mencapai batas {{max}} karyawan aktif pada paket saat ini. Tingkatkan paket untuk menambah karyawan.</p>${button('billingUrl', 'Lihat paket')}`,
    variables: [NAME, TENANT, v('max', 'Batas', '50'), BILLING_URL]
  }
]

// ---------------------------------------------------------------------------
// Notifikasi (bel + push)
// ---------------------------------------------------------------------------

export const NOTIFICATION_TEMPLATES: NotificationTemplateDef[] = [
  { key: 'welcome', name: 'Selamat datang', title: 'Selamat datang di {{appName}}', body: 'Lengkapi pengaturan perusahaan lalu tambahkan karyawan pertama Anda.', actionLabel: 'Mulai', actionUrl: '/app/dashboard', icon: 'i-lucide-party-popper', level: 'success', variables: [v('appName', 'Nama aplikasi', 'HRIS Nexadream')] },
  { key: 'trial_started', name: 'Uji coba dimulai', title: 'Uji coba {{planName}} aktif', body: 'Anda bisa mencoba semua fitur paket {{planName}} sampai {{trialEndsAt}}.', actionLabel: 'Lihat paket', actionUrl: '/app/billing', icon: 'i-lucide-sparkles', level: 'info', variables: [PLAN, v('trialEndsAt', 'Akhir uji coba', '29 Oktober 2026')] },
  { key: 'trial_ending_soon', name: 'Uji coba segera berakhir', title: 'Uji coba berakhir {{daysLeft}} hari lagi', body: 'Pilih paket agar fitur {{planName}} tetap aktif.', actionLabel: 'Pilih paket', actionUrl: '/app/billing', icon: 'i-lucide-hourglass', level: 'warning', variables: [v('daysLeft', 'Sisa hari', '3'), PLAN] },
  { key: 'payment_success', name: 'Pembayaran diterima', title: 'Pembayaran diterima', body: 'Paket {{planName}} aktif sampai {{periodEnd}}.', actionLabel: 'Lihat langganan', actionUrl: '/app/billing', icon: 'i-lucide-circle-check', level: 'success', variables: [PLAN, v('periodEnd', 'Aktif sampai', '15 November 2026')] },
  { key: 'payment_failed', name: 'Pembayaran gagal', title: 'Pembayaran gagal', body: 'Selesaikan pembayaran sebelum {{graceEndsAt}} agar fitur tetap aktif.', actionLabel: 'Bayar sekarang', actionUrl: '/app/billing', icon: 'i-lucide-credit-card', level: 'error', variables: [v('graceEndsAt', 'Batas masa tenggang', '18 Oktober 2026')] },
  { key: 'subscription_downgraded', name: 'Turun ke paket Free', title: 'Akun turun ke paket Free', body: 'Data Anda aman. Atur kantor yang tetap aktif bila melebihi batas.', actionLabel: 'Atur kantor', actionUrl: '/app/branches', icon: 'i-lucide-arrow-down-circle', level: 'warning', variables: [] },
  { key: 'leave_requested', name: 'Pengajuan cuti (penyetuju)', title: 'Pengajuan cuti dari {{employeeName}}', body: '{{leaveTypeName}}, {{startDate}} – {{endDate}}.', actionLabel: 'Tinjau', actionUrl: '/app/approvals', icon: 'i-lucide-plane', level: 'info', variables: [EMPLOYEE, LEAVE_TYPE, START, END] },
  { key: 'leave_approved', name: 'Cuti disetujui', title: 'Cuti Anda disetujui', body: '{{leaveTypeName}}, {{startDate}} – {{endDate}}.', actionLabel: 'Lihat', actionUrl: '/app/me/leave', icon: 'i-lucide-plane', level: 'success', variables: [LEAVE_TYPE, START, END] },
  { key: 'leave_rejected', name: 'Cuti ditolak', title: 'Cuti Anda ditolak', body: '{{leaveTypeName}}, {{startDate}} – {{endDate}}.', actionLabel: 'Lihat', actionUrl: '/app/me/leave', icon: 'i-lucide-plane', level: 'warning', variables: [LEAVE_TYPE, START, END] },
  { key: 'payslip_published', name: 'Slip gaji terbit', title: 'Slip gaji {{periodLabel}} tersedia', body: 'Buka untuk melihat rincian slip gaji Anda.', actionLabel: 'Lihat', actionUrl: '/app/me/payslips', icon: 'i-lucide-file-text', level: 'info', variables: [v('periodLabel', 'Periode', 'Oktober 2026')] },
  { key: 'attendance_missing', name: 'Absensi belum lengkap', title: 'Absensi {{date}} belum lengkap', body: 'Ajukan koreksi jika catatan ini keliru.', actionLabel: 'Buka absensi', actionUrl: '/app/me/attendance', icon: 'i-lucide-clock-alert', level: 'warning', variables: [v('date', 'Tanggal', '14 Oktober 2026')] },
  { key: 'contract_expiring', name: 'Kontrak segera berakhir', title: '{{count}} kontrak segera berakhir', body: 'Dalam {{days}} hari ke depan.', actionLabel: 'Lihat', actionUrl: '/app/employees?contract=expiring', icon: 'i-lucide-file-clock', level: 'warning', variables: [v('count', 'Jumlah', '2'), v('days', 'Hari', '30')] },
  { key: 'overtime_requested', name: 'Pengajuan lembur (penyetuju)', title: 'Pengajuan lembur dari {{employeeName}}', body: 'Menunggu persetujuan Anda.', actionLabel: 'Tinjau', actionUrl: '/app/approvals', icon: 'i-lucide-timer', level: 'info', variables: [EMPLOYEE] },
  { key: 'reimbursement_requested', name: 'Pengajuan reimbursement (penyetuju)', title: 'Pengajuan reimbursement dari {{employeeName}}', body: 'Menunggu persetujuan Anda.', actionLabel: 'Tinjau', actionUrl: '/app/approvals', icon: 'i-lucide-receipt', level: 'info', variables: [EMPLOYEE] },
  { key: 'request_decided', name: 'Keputusan pengajuan', title: 'Pengajuan {{requestTypeLabel}} {{decisionLabel}}', body: 'Buka untuk melihat detail.', actionLabel: 'Lihat', actionUrl: '/app/me/requests', icon: 'i-lucide-check-check', level: 'info', variables: [v('requestTypeLabel', 'Jenis', 'lembur'), v('decisionLabel', 'Keputusan', 'disetujui')] },
  { key: 'approval_requested', name: 'Pengajuan menunggu persetujuan', title: 'Pengajuan {{requestTypeLabel}} dari {{employeeName}}', body: 'Menunggu persetujuan Anda.', actionLabel: 'Tinjau', actionUrl: '/app/approvals', icon: 'i-lucide-inbox', level: 'info', variables: [EMPLOYEE, v('requestTypeLabel', 'Jenis pengajuan', 'koreksi absen')] },
  { key: 'employee_limit_reached', name: 'Batas karyawan tercapai', title: 'Batas karyawan paket {{planName}} tercapai', body: 'Tingkatkan paket untuk menambah karyawan aktif.', actionLabel: 'Lihat paket', actionUrl: '/app/billing', icon: 'i-lucide-users', level: 'warning', variables: [PLAN] },
  { key: 'team_invite_accepted', name: 'Undangan tim diterima', title: '{{memberName}} bergabung ke tim', body: 'Sebagai {{roleName}}.', actionLabel: 'Lihat tim', actionUrl: '/app/team', icon: 'i-lucide-user-check', level: 'success', variables: [v('memberName', 'Nama anggota', 'Dewi Lestari'), v('roleName', 'Peran', 'Admin HR')] },
  { key: 'inactivity_nudge', name: 'Pengingat aktivitas (push)', title: 'Ada yang menunggu di {{appName}}', body: 'Cek absensi dan pengajuan tim Anda hari ini.', actionUrl: '/app/dashboard', icon: 'i-lucide-bell', level: 'info', variables: [] },
  { key: 'tenant_suspended', name: 'Akun ditangguhkan', title: 'Akun perusahaan ditangguhkan', body: 'Hubungi tim dukungan kami untuk informasi lebih lanjut.', actionUrl: '/contact', icon: 'i-lucide-ban', level: 'error', variables: [] },
  { key: 'tenant_deleted', name: 'Akun dihapus', title: 'Akun perusahaan dihapus', body: 'Hubungi kami bila ini keliru.', actionUrl: '/contact', icon: 'i-lucide-trash-2', level: 'error', variables: [] },
  { key: 'admin_new_tenant', name: 'Perusahaan baru (staf)', title: 'Perusahaan baru: {{tenantName}}', body: 'Baru saja mendaftar dengan paket {{planName}}.', actionLabel: 'Lihat', actionUrl: '/admin/tenants/{{tenantId}}', icon: 'i-lucide-building-2', level: 'info', variables: [TENANT, PLAN, v('tenantId', 'ID perusahaan', 'ck123')] },
  { key: 'admin_new_message', name: 'Pesan baru (staf)', title: 'Pesan baru dari {{name}}', body: '{{subject}}', actionLabel: 'Buka', actionUrl: '/admin/messages', icon: 'i-lucide-inbox', level: 'info', variables: [NAME, v('subject', 'Subjek', 'Tanya harga')] },
  { key: 'admin_delete_request', name: 'Permintaan hapus akun (staf)', title: '{{tenantName}} meminta penghapusan akun', body: 'Tindak lanjuti dalam {{slaDays}} hari.', actionLabel: 'Lihat', actionUrl: '/admin/tenants/{{tenantId}}', icon: 'i-lucide-trash', level: 'warning', variables: [TENANT, v('slaDays', 'SLA (hari)', '30'), v('tenantId', 'ID perusahaan', 'ck123')] }
]

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export type TemplateVariables = Record<string, string | number | null | undefined>

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

/**
 * {{token}} → nilai (tidak dikenal/null → ''). Blok opsional {{#name}}…{{/name}} hanya dirender
 * bila `name` tidak kosong. Dengan `escape`, nilai di-escape HTML (salinan templat tidak).
 */
export function renderTemplateString(source: string, variables: TemplateVariables, escape = false): string {
  const withBlocks = source.replace(/\{\{#\s*([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/g, (_m, name: string, inner: string) =>
    isEmpty(variables[name]) ? '' : inner)
  return withBlocks.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, token: string) => {
    const value = variables[token]
    if (isEmpty(value)) return ''
    const text = String(value)
    return escape ? escapeHtml(text) : text
  })
}

/** Alias lama (fase 3). */
export const renderTemplate = renderTemplateString

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Nilai contoh dari daftar variabel (untuk pratinjau). */
export function sampleVariables(variables: TemplateVariable[]): Record<string, string> {
  return Object.fromEntries([...COMMON_EMAIL_VARIABLES, ...variables].map(item => [item.token, item.sample]))
}
