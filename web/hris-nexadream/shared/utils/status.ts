// Label & warna setiap enum. Slug enum tidak pernah ditampilkan langsung — selalu lewat peta ini
// dan satu komponen <StatusBadge>.

export type BadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
export interface StatusMeta { label: string, color: BadgeColor }

export const TENANT_STATUS_META: Record<string, StatusMeta> = {
  active: { label: 'Aktif', color: 'success' },
  suspended: { label: 'Ditangguhkan', color: 'error' },
  deleted: { label: 'Dihapus', color: 'neutral' }
}

export const SUBSCRIPTION_STATUS_META: Record<string, StatusMeta> = {
  trialing: { label: 'Uji coba', color: 'info' },
  active: { label: 'Aktif', color: 'success' },
  past_due: { label: 'Menunggu pembayaran', color: 'warning' },
  cancelled: { label: 'Dibatalkan', color: 'neutral' },
  downgraded: { label: 'Turun ke paket Free', color: 'neutral' },
  suspended: { label: 'Ditangguhkan', color: 'error' }
}

export const PAYMENT_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: 'Menunggu', color: 'warning' },
  paid: { label: 'Lunas', color: 'success' },
  failed: { label: 'Gagal', color: 'error' },
  expired: { label: 'Kedaluwarsa', color: 'neutral' },
  refunded: { label: 'Dikembalikan', color: 'info' },
  cancelled: { label: 'Dibatalkan', color: 'neutral' },
  challenge: { label: 'Ditinjau', color: 'warning' }
}

export const TENANT_ROLE_META: Record<string, StatusMeta> = {
  owner: { label: 'Pemilik', color: 'primary' },
  hr_admin: { label: 'Admin HR', color: 'info' },
  manager: { label: 'Atasan / Manajer', color: 'secondary' },
  employee: { label: 'Karyawan', color: 'neutral' }
}

export const ACTIVE_FLAG_META: Record<'true' | 'false', StatusMeta> = {
  true: { label: 'Aktif', color: 'success' },
  false: { label: 'Nonaktif', color: 'neutral' }
}

// Peta domain HR (dipakai mulai fase 11).
export const EMPLOYMENT_STATUS_META: Record<string, StatusMeta> = {
  active: { label: 'Aktif', color: 'success' },
  probation: { label: 'Masa percobaan', color: 'info' },
  on_leave: { label: 'Sedang cuti', color: 'warning' },
  inactive: { label: 'Nonaktif', color: 'neutral' },
  terminated: { label: 'Berhenti', color: 'neutral' }
}

export const REQUEST_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: 'Menunggu', color: 'warning' },
  approved: { label: 'Disetujui', color: 'success' },
  rejected: { label: 'Ditolak', color: 'error' },
  cancelled: { label: 'Dibatalkan', color: 'neutral' }
}

export const ATTENDANCE_STATUS_META: Record<string, StatusMeta> = {
  present: { label: 'Hadir', color: 'success' },
  late: { label: 'Terlambat', color: 'warning' },
  absent: { label: 'Tidak hadir', color: 'error' },
  leave: { label: 'Cuti', color: 'info' },
  holiday: { label: 'Libur', color: 'neutral' },
  off: { label: 'Hari libur kerja', color: 'neutral' },
  not_yet: { label: 'Belum absen', color: 'neutral' }
}

export const PAYROLL_STATUS_META: Record<string, StatusMeta> = {
  draft: { label: 'Draf', color: 'neutral' },
  calculated: { label: 'Dihitung', color: 'info' },
  approved: { label: 'Disetujui', color: 'primary' },
  paid_recorded: { label: 'Tercatat dibayar', color: 'success' },
  void: { label: 'Dibatalkan', color: 'error' }
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.sign_in': 'Masuk',
  'auth.sign_in_failed': 'Gagal masuk',
  'auth.sign_out': 'Keluar',
  'auth.password_reset': 'Atur ulang kata sandi',
  'auth.password_change': 'Ubah kata sandi',
  'tenant.register': 'Pendaftaran perusahaan',
  'tenant.suspend': 'Perusahaan ditangguhkan',
  'tenant.reinstate': 'Perusahaan dipulihkan',
  'tenant.delete': 'Perusahaan dihapus',
  'tenant.delete_request': 'Permintaan hapus akun',
  'tenant.impersonate_start': 'Mulai masuk sebagai perusahaan',
  'tenant.impersonate_stop': 'Selesai masuk sebagai perusahaan',
  'user.impersonate_start': 'Mulai masuk sebagai staf',
  'user.impersonate_stop': 'Selesai masuk sebagai staf',
  'user.invite': 'Undang staf',
  'user.invite_accept': 'Undangan staf diterima',
  'role.update': 'Peran diubah',
  'permission.update': 'Hak akses diubah',
  'employee.create': 'Karyawan ditambahkan',
  'employee.update': 'Data karyawan diubah',
  'employee.employment_change': 'Perubahan kepegawaian',
  'employee.terminate': 'Karyawan berhenti',
  'employee.reactivate': 'Karyawan diaktifkan kembali',
  'employee.import': 'Impor karyawan',
  'employee.export': 'Ekspor karyawan',
  'employee.sensitive_read': 'Membuka data pribadi karyawan',
  'salary.read': 'Membuka data gaji',
  'employee.salary_set': 'Gaji diatur',
  'employee.ess_invite': 'Undangan layanan mandiri',
  'employee.ess_link': 'Login ditautkan ke karyawan',
  'employee.ess_revoke': 'Akses layanan mandiri dicabut',
  'attendance.admin_set': 'Absensi diubah admin',
  'attendance_correction.approve': 'Koreksi absen disetujui',
  'attendance_correction.reject': 'Koreksi absen ditolak',
  'leave.request.create': 'Pengajuan cuti',
  'leave.request.approve': 'Cuti disetujui',
  'leave.request.reject': 'Cuti ditolak',
  'leave.request.cancel': 'Cuti dibatalkan',
  'leave.balance_adjust': 'Saldo cuti disesuaikan',
  'overtime.approve': 'Lembur disetujui',
  'overtime.reject': 'Lembur ditolak',
  'reimbursement.approve': 'Reimbursement disetujui',
  'reimbursement.reject': 'Reimbursement ditolak',
  'payroll_run.create': 'Run payroll dibuat',
  'payroll_run.calculate': 'Payroll dihitung',
  'payroll_run.approve': 'Payroll disetujui',
  'payroll_run.mark_paid': 'Payroll tercatat dibayar',
  'payroll_run.void': 'Payroll dibatalkan (void)',
  'payroll_run.export': 'Ekspor payroll',
  'document.upload': 'Dokumen diunggah',
  'document.delete': 'Dokumen dihapus',
  'performance_review.finalize': 'Penilaian kinerja diselesaikan',
  'reference_data.update': 'Data referensi diubah',
  'reference_data.delete': 'Data referensi dihapus',
  'hr_settings.update': 'Pengaturan HR diubah',
  'api_client.create': 'API key dibuat',
  'api_client.revoke': 'API key dicabut'
}

export function statusMeta(map: Record<string, StatusMeta>, value: string | null | undefined): StatusMeta {
  if (!value) return { label: '-', color: 'neutral' }
  return map[value] ?? { label: value, color: 'neutral' }
}
