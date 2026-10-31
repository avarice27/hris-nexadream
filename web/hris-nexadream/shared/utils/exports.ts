// Jenis ekspor latar (server/utils/export-jobs.ts).
export const EXPORT_KINDS = ['employees', 'attendance_records', 'leave_requests', 'payslips'] as const
export type ExportKind = (typeof EXPORT_KINDS)[number]

export const EXPORT_KIND_LABELS: Record<ExportKind, string> = {
  employees: 'Data karyawan',
  attendance_records: 'Catatan absensi harian',
  leave_requests: 'Pengajuan cuti',
  payslips: 'Ringkasan slip gaji (setahun)'
}

/** Jenis yang butuh rentang tanggal; sisanya per tahun (slip) atau tanpa filter (karyawan). */
export const EXPORT_KINDS_WITH_RANGE: readonly ExportKind[] = ['attendance_records', 'leave_requests']
