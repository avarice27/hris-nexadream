// Katalog domain HR (fase 11): nilai enum English + label Bahasa Indonesia.
// Dipakai server (validasi) dan client (form, badge). Lihat saas-blueprint/18 §1.2.
import type { StatusMeta } from './status'

export const EMPLOYMENT_TYPES = ['permanent', 'contract', 'internship', 'daily', 'freelance'] as const
export type EmploymentTypeSlug = (typeof EMPLOYMENT_TYPES)[number]
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentTypeSlug, string> = {
  permanent: 'Karyawan tetap (PKWTT)',
  contract: 'Kontrak (PKWT)',
  internship: 'Magang',
  daily: 'Harian lepas',
  freelance: 'Lepas / freelance'
}

export const EMPLOYMENT_STATUSES = ['active', 'probation', 'on_leave', 'inactive', 'terminated'] as const
export type EmploymentStatusSlug = (typeof EMPLOYMENT_STATUSES)[number]
/** Status yang dihitung batas paket `employees` (LIMIT_META.employees). */
export const COUNTED_EMPLOYMENT_STATUSES: EmploymentStatusSlug[] = ['active', 'probation', 'on_leave']

export const GENDERS = ['male', 'female'] as const
export const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = { male: 'Laki-laki', female: 'Perempuan' }

export const MARITAL_STATUSES = ['single', 'married', 'divorced', 'widowed'] as const
export const MARITAL_LABELS: Record<(typeof MARITAL_STATUSES)[number], string> = {
  single: 'Belum kawin',
  married: 'Kawin',
  divorced: 'Cerai hidup',
  widowed: 'Cerai mati'
}

export const RELIGIONS = ['islam', 'protestant', 'catholic', 'hindu', 'buddhist', 'confucian', 'other'] as const
export const RELIGION_LABELS: Record<(typeof RELIGIONS)[number], string> = {
  islam: 'Islam',
  protestant: 'Kristen Protestan',
  catholic: 'Katolik',
  hindu: 'Hindu',
  buddhist: 'Buddha',
  confucian: 'Khonghucu',
  other: 'Lainnya'
}

export const FAMILY_RELATIONSHIPS = ['spouse', 'child', 'parent', 'sibling'] as const
export const FAMILY_RELATIONSHIP_LABELS: Record<(typeof FAMILY_RELATIONSHIPS)[number], string> = {
  spouse: 'Suami/istri',
  child: 'Anak',
  parent: 'Orang tua',
  sibling: 'Saudara kandung'
}

export const DOCUMENT_CATEGORIES = ['contract', 'identity', 'certificate', 'tax', 'medical', 'other', 'company'] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  contract: 'Kontrak kerja',
  identity: 'Identitas (KTP/KK)',
  certificate: 'Sertifikat / ijazah',
  tax: 'Pajak (bukti potong)',
  medical: 'Kesehatan',
  other: 'Lainnya',
  company: 'Dokumen perusahaan'
}

export const REIMBURSEMENT_CATEGORIES = ['transport', 'meal', 'medical', 'travel', 'equipment', 'communication', 'other'] as const
export type ReimbursementCategory = (typeof REIMBURSEMENT_CATEGORIES)[number]
export const REIMBURSEMENT_CATEGORY_LABELS: Record<ReimbursementCategory, string> = {
  transport: 'Transportasi',
  meal: 'Makan',
  medical: 'Kesehatan',
  travel: 'Perjalanan dinas',
  equipment: 'Peralatan kerja',
  communication: 'Pulsa / internet',
  other: 'Lainnya'
}

export const OVERTIME_DAY_TYPES = ['workday', 'rest_day', 'holiday'] as const
export const OVERTIME_DAY_TYPE_LABELS: Record<(typeof OVERTIME_DAY_TYPES)[number], string> = {
  workday: 'Hari kerja',
  rest_day: 'Hari istirahat',
  holiday: 'Hari libur resmi'
}

/** Jenis permintaan yang memakai mekanisme persetujuan bersama. */
export const APPROVAL_SUBJECTS = ['leave', 'overtime', 'reimbursement', 'attendance_correction'] as const
export type ApprovalSubject = (typeof APPROVAL_SUBJECTS)[number]
export const APPROVAL_SUBJECT_LABELS: Record<ApprovalSubject, string> = {
  leave: 'Cuti',
  overtime: 'Lembur',
  reimbursement: 'Reimbursement',
  attendance_correction: 'Koreksi absen'
}
export const APPROVER_TYPES = ['manager', 'hr'] as const
export type ApproverType = (typeof APPROVER_TYPES)[number]
export const APPROVER_TYPE_LABELS: Record<ApproverType, string> = { manager: 'Atasan langsung', hr: 'Admin HR' }
/** Rantai bawaan (tanpa fitur customApprovalFlows): atasan langsung; bila tidak ada → Admin HR. */
export const DEFAULT_APPROVAL_CHAIN: ApproverType[] = ['manager']

/** Kode yang dibaca manusia per jenis rekam (PREFIX-YYMMDD-NNNN). */
export const RECORD_CODE_PREFIX = {
  leave: 'CT',
  overtime: 'LB',
  reimbursement: 'RB',
  attendance_correction: 'KA',
  payroll_run: 'PR',
  payslip: 'SL'
} as const

export const PERFORMANCE_CYCLE_STATUS_META: Record<string, StatusMeta> = {
  draft: { label: 'Draf', color: 'neutral' },
  active: { label: 'Berjalan', color: 'info' },
  closed: { label: 'Selesai', color: 'success' }
}
export const PERFORMANCE_REVIEW_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: 'Belum diisi', color: 'neutral' },
  self_submitted: { label: 'Menunggu atasan', color: 'warning' },
  completed: { label: 'Selesai', color: 'success' }
}
export const APPROVAL_STEP_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: 'Menunggu', color: 'warning' },
  approved: { label: 'Disetujui', color: 'success' },
  rejected: { label: 'Ditolak', color: 'error' },
  skipped: { label: 'Dilewati', color: 'neutral' },
  cancelled: { label: 'Dibatalkan', color: 'neutral' }
}

/** Jenis cuti awal (UU 13/2003 jo. UU 6/2023 + kebiasaan umum). Disalin ke leave_types saat pertama dipakai. */
export const DEFAULT_LEAVE_TYPES: Array<{ code: string, name: string, annualDays: number | null, isPaid: boolean, requiresAttachment: boolean, eligibleAfterMonths: number, allowHalfDay: boolean, genderRestriction: 'male' | 'female' | null }> = [
  { code: 'ANNUAL', name: 'Cuti tahunan', annualDays: 12, isPaid: true, requiresAttachment: false, eligibleAfterMonths: 12, allowHalfDay: true, genderRestriction: null },
  { code: 'SICK', name: 'Sakit (dengan surat dokter)', annualDays: null, isPaid: true, requiresAttachment: true, eligibleAfterMonths: 0, allowHalfDay: false, genderRestriction: null },
  { code: 'MATERNITY', name: 'Cuti melahirkan', annualDays: 90, isPaid: true, requiresAttachment: true, eligibleAfterMonths: 0, allowHalfDay: false, genderRestriction: 'female' },
  { code: 'MARRIAGE', name: 'Menikah', annualDays: 3, isPaid: true, requiresAttachment: false, eligibleAfterMonths: 0, allowHalfDay: false, genderRestriction: null },
  { code: 'BEREAVEMENT', name: 'Keluarga meninggal', annualDays: 2, isPaid: true, requiresAttachment: false, eligibleAfterMonths: 0, allowHalfDay: false, genderRestriction: null },
  { code: 'UNPAID', name: 'Cuti tanpa upah', annualDays: null, isPaid: false, requiresAttachment: false, eligibleAfterMonths: 0, allowHalfDay: true, genderRestriction: null }
]

/** Komponen gaji awal perusahaan baru. */
export const DEFAULT_SALARY_COMPONENTS: Array<{ code: string, name: string, kind: 'earning' | 'deduction', taxable: boolean, bpjsBase: boolean, thrBase: boolean }> = [
  { code: 'FIXED_ALLOWANCE', name: 'Tunjangan tetap', kind: 'earning', taxable: true, bpjsBase: true, thrBase: true },
  { code: 'POSITION_ALLOWANCE', name: 'Tunjangan jabatan', kind: 'earning', taxable: true, bpjsBase: true, thrBase: true },
  { code: 'TRANSPORT', name: 'Tunjangan transport', kind: 'earning', taxable: true, bpjsBase: false, thrBase: false },
  { code: 'MEAL', name: 'Tunjangan makan', kind: 'earning', taxable: true, bpjsBase: false, thrBase: false },
  { code: 'LOAN', name: 'Cicilan pinjaman', kind: 'deduction', taxable: false, bpjsBase: false, thrBase: false }
]

/** Kategori kolom CSV impor karyawan (urutan = templat). */
export const EMPLOYEE_IMPORT_COLUMNS = [
  'employeeNumber', 'fullName', 'email', 'phone', 'gender', 'birthDate', 'joinDate', 'employmentType',
  'branchName', 'departmentName', 'positionName', 'ptkpStatus', 'nik', 'npwp', 'bankName', 'bankAccountNumber', 'bankAccountName', 'baseSalary'
] as const
export const EMPLOYEE_IMPORT_HEADERS: Record<(typeof EMPLOYEE_IMPORT_COLUMNS)[number], string> = {
  employeeNumber: 'NIP',
  fullName: 'Nama lengkap',
  email: 'Email',
  phone: 'No HP',
  gender: 'Jenis kelamin (L/P)',
  birthDate: 'Tanggal lahir (YYYY-MM-DD)',
  joinDate: 'Tanggal masuk (YYYY-MM-DD)',
  employmentType: 'Jenis (tetap/kontrak/magang/harian/lepas)',
  branchName: 'Kantor',
  departmentName: 'Departemen',
  positionName: 'Jabatan',
  ptkpStatus: 'PTKP (TK0..K3)',
  nik: 'NIK',
  npwp: 'NPWP',
  bankName: 'Bank',
  bankAccountNumber: 'No rekening',
  bankAccountName: 'Nama pemilik rekening',
  baseSalary: 'Gaji pokok'
}

/** NIK = 16 digit. */
export function isValidNik(value: string): boolean {
  return /^\d{16}$/.test(value.replace(/\s/g, ''))
}
