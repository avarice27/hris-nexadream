// Katalog TUNGGAL endpoint /api/v1 (12 §8). Halaman /docs/api dan GET /api/v1/openapi.json
// dibuat dari sini. Endpoint v1 baru dianggap selesai hanya bila entri katalognya ada.
// Prosa dalam Bahasa Indonesia; path, nama field, nilai enum, dan contoh payload persis seperti di API.

export interface ApiParam { name: string, in: 'path' | 'query' | 'header', type: string, required?: boolean, description: string, example?: string }
export interface ApiBodyField { name: string, type: string, description: string, required?: boolean }

export interface ApiEndpoint {
  id: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  summary: string
  description?: string
  auth: 'none' | 'bearer' | 'bearer-or-apikey'
  params?: ApiParam[]
  body?: ApiBodyField[]
  responseExample: unknown
  responseContentType?: string
  errors?: string[]
  paginated?: boolean
  cacheable?: boolean
  /** Bagian dari referensi publik untuk integrator (bisa dipanggil dengan API key). */
  enterprise?: boolean
}

export interface ApiSection { id: string, title: string, description: string, endpoints: ApiEndpoint[] }

export const API_BASE_PATH = '/api/v1'

const PAGE_PARAMS: ApiParam[] = [
  { name: 'page', in: 'query', type: 'integer', description: 'Halaman, mulai 1.', example: '1' },
  { name: 'limit', in: 'query', type: 'integer', description: 'Jumlah per halaman (1–100, bawaan 20).', example: '20' },
  { name: 'search', in: 'query', type: 'string', description: 'Pencarian teks (≥ 2 karakter).' }
]
const META = { page: 1, limit: 20, total: 1, pageCount: 1 }
const ID = (desc: string): ApiParam => ({ name: 'id', in: 'path', type: 'string', required: true, description: desc })

const EMPLOYEE_EXAMPLE = {
  id: 'cm0employee000000000000001', employeeNumber: 'EMP-0004', fullName: 'Budi Santoso', email: 'budi@contoh.co.id', phone: '6281200000013',
  photoUrl: null, status: 'active', employmentType: 'permanent', joinDate: '2023-04-17', contractEndDate: null, branchId: 'cm0branch0000000000000001',
  branchName: 'Kantor Pusat', departmentName: 'Operasional', positionName: 'Staf', managerName: 'Agus Pratama', hasLogin: true
}

export const API_SECTIONS: ApiSection[] = [
  {
    id: 'basics',
    title: 'Dasar',
    description: 'Pengaturan publik dan daftar paket — tanpa autentikasi.',
    endpoints: [
      { id: 'settings-public', method: 'GET', path: '/settings/public', summary: 'Pengaturan publik aplikasi', auth: 'none', cacheable: true, responseExample: { appName: 'HRIS Nexadream', minimumMobileVersion: '1.0.0', registrationOpen: true, supportEmail: 'support@nexadream.id' } },
      { id: 'plans', method: 'GET', path: '/plans', summary: 'Paket langganan aktif & publik', auth: 'none', cacheable: true, responseExample: [{ slug: 'growth', name: 'Growth', priceMonthly: 199000, priceYearly: 1990000, currency: 'IDR', trialDays: 14, limits: { employees: 50, branches: 3 }, features: { payroll: false } }] }
    ]
  },
  {
    id: 'auth',
    title: 'Autentikasi',
    description: 'Masuk dengan email/nomor HP dan kata sandi untuk mendapatkan token Bearer (aplikasi mobile). Integrasi server-ke-server memakai header X-Api-Key.',
    endpoints: [
      { id: 'login', method: 'POST', path: '/auth/login', summary: 'Masuk', auth: 'none', body: [{ name: 'identifier', type: 'string', required: true, description: 'Email atau nomor HP.' }, { name: 'password', type: 'string', required: true, description: 'Kata sandi.' }], errors: ['RATE_LIMITED'], responseExample: { token: 'eyJhbGciOi…', expiresAt: '2026-10-22T08:00:00.000Z', user: { id: 'cm0user', name: 'Budi Santoso', tenantRole: 'employee' } } },
      { id: 'logout', method: 'POST', path: '/auth/logout', summary: 'Keluar (mencabut token)', auth: 'bearer', responseExample: { success: true } },
      { id: 'me', method: 'GET', path: '/me', summary: 'Profil login & perusahaan', auth: 'bearer', responseExample: { user: { id: 'cm0user', name: 'Budi Santoso', email: 'budi@contoh.co.id', tenantRole: 'employee' }, tenant: { id: 'cm0tenant', name: 'PT Contoh', timezone: 'Asia/Jakarta' }, employeeId: 'cm0employee000000000000001' } }
    ]
  },
  {
    id: 'organization',
    title: 'Organisasi',
    description: 'Kantor, departemen, dan jabatan perusahaan.',
    endpoints: [
      { id: 'branches', method: 'GET', path: '/branches', summary: 'Daftar kantor', auth: 'bearer-or-apikey', enterprise: true, responseExample: [{ id: 'cm0branch0000000000000001', name: 'Kantor Pusat', timezone: 'Asia/Jakarta', isActive: true, isPrimary: true }] },
      { id: 'departments', method: 'GET', path: '/departments', summary: 'Daftar departemen', auth: 'bearer-or-apikey', enterprise: true, responseExample: [{ id: 'cm0dept', name: 'Operasional', code: null, parentId: null, isActive: true, employeeCount: 4 }] },
      { id: 'positions', method: 'GET', path: '/positions', summary: 'Daftar jabatan', auth: 'bearer-or-apikey', enterprise: true, responseExample: [{ id: 'cm0pos', name: 'Staf', level: 4, isActive: true, employeeCount: 6 }] }
    ]
  },
  {
    id: 'employees',
    title: 'Karyawan',
    description: 'Data karyawan. Daftar tidak pernah memuat data pribadi; NIK, NPWP, BPJS, dan rekening hanya tersamar di detail. API key tanpa scope `sensitive` tidak bisa membuka data pribadi maupun gaji.',
    endpoints: [
      { id: 'employees-list', method: 'GET', path: '/employees', summary: 'Daftar karyawan', auth: 'bearer-or-apikey', enterprise: true, paginated: true, params: [...PAGE_PARAMS, { name: 'status', in: 'query', type: 'string', description: 'active | probation | on_leave | inactive | terminated | current (aktif semua).' }, { name: 'branchId', in: 'query', type: 'string', description: 'Filter kantor.' }, { name: 'departmentId', in: 'query', type: 'string', description: 'Filter departemen.' }], responseExample: { data: [EMPLOYEE_EXAMPLE], meta: META } },
      { id: 'employees-create', method: 'POST', path: '/employees', summary: 'Tambah karyawan', auth: 'bearer-or-apikey', enterprise: true, errors: ['LIMIT_REACHED', 'CONFLICT'], body: [{ name: 'fullName', type: 'string', required: true, description: 'Nama lengkap.' }, { name: 'joinDate', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal masuk.' }, { name: 'branchId', type: 'string', required: true, description: 'Kantor.' }, { name: 'employeeNumber', type: 'string', description: 'NIP; kosong = otomatis.' }, { name: 'email', type: 'string', description: 'Email.' }, { name: 'employmentType', type: 'string', description: 'permanent | contract | internship | daily | freelance.' }, { name: 'departmentId', type: 'string', description: 'Departemen.' }, { name: 'positionId', type: 'string', description: 'Jabatan.' }, { name: 'managerId', type: 'string', description: 'Atasan langsung (id karyawan).' }, { name: 'nik', type: 'string', description: 'NIK 16 digit (disimpan terenkripsi).' }], responseExample: { id: 'cm0employee000000000000011', employeeNumber: 'EMP-0011' } },
      { id: 'employees-get', method: 'GET', path: '/employees/{id}', summary: 'Detail karyawan', auth: 'bearer-or-apikey', enterprise: true, params: [ID('Id karyawan.')], responseExample: { ...EMPLOYEE_EXAMPLE, ptkpStatus: 'TK0', sensitive: { nik: '3174••••••••0001', npwp: null, bpjsKesehatanNumber: null, bpjsKetenagakerjaanNumber: null, bankName: 'BCA', bankAccountNumber: '5210••••0137', bankAccountName: 'Budi Santoso' } } },
      { id: 'employees-update', method: 'PATCH', path: '/employees/{id}', summary: 'Ubah profil karyawan', description: 'Kantor, departemen, jabatan, atasan, dan status diubah lewat perubahan kepegawaian berlaku-tanggal di konsol.', auth: 'bearer-or-apikey', enterprise: true, params: [ID('Id karyawan.')], body: [{ name: 'phone', type: 'string', description: 'No HP.' }, { name: 'ptkpStatus', type: 'string', description: 'TK0..TK3, K0..K3.' }], responseExample: { success: true } }
    ]
  },
  {
    id: 'attendance',
    title: 'Kehadiran',
    description: 'Hari kerja dihitung pada zona waktu kantor karyawan (WIB/WITA/WIT). Waktu dikirim sebagai instan ISO UTC.',
    endpoints: [
      { id: 'attendance-daily', method: 'GET', path: '/attendance/daily', summary: 'Papan kehadiran harian', auth: 'bearer-or-apikey', enterprise: true, paginated: true, params: [...PAGE_PARAMS, { name: 'date', in: 'query', type: 'string (YYYY-MM-DD)', description: 'Tanggal; bawaan hari ini.' }, { name: 'status', in: 'query', type: 'string', description: 'present | late | absent | leave | off | holiday | not_yet.' }], responseExample: { data: [{ employeeId: 'cm0employee000000000000001', fullName: 'Budi Santoso', status: 'present', record: { clockInAt: '2026-10-15T00:55:00.000Z', clockOutAt: '2026-10-15T10:05:00.000Z', lateMinutes: 0, workedMinutes: 490 } }], meta: META } },
      { id: 'me-attendance-today', method: 'GET', path: '/me/attendance/today', summary: 'Absensi saya hari ini', auth: 'bearer', responseExample: { date: '2026-10-15', timezone: 'Asia/Jakarta', canClockIn: true, canClockOut: false, policy: { requireGeofence: false, requireSelfie: false, geofence: null } } },
      { id: 'me-clock-in', method: 'POST', path: '/me/attendance/clock-in', summary: 'Absen masuk', auth: 'bearer', errors: ['OUTSIDE_GEOFENCE', 'CONFLICT'], body: [{ name: 'latitude', type: 'number', description: 'Wajib bila geofence aktif.' }, { name: 'longitude', type: 'number', description: 'Wajib bila geofence aktif.' }, { name: 'accuracy', type: 'number', description: 'Akurasi GPS (meter).' }], responseExample: { id: 'cm0att', workDate: '2026-10-15', clockInTime: '07:58', status: 'present', lateMinutes: 0 } },
      { id: 'me-clock-out', method: 'POST', path: '/me/attendance/clock-out', summary: 'Absen pulang', auth: 'bearer', errors: ['CONFLICT'], responseExample: { id: 'cm0att', workDate: '2026-10-15', clockOutTime: '17:04', workedMinutes: 486 } },
      { id: 'me-attendance-calendar', method: 'GET', path: '/me/attendance/calendar', summary: 'Kalender absensi saya', description: 'Jadwal, rekam absen, dan cuti per hari.', auth: 'bearer', params: [{ name: 'from', in: 'query', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal awal.' }, { name: 'to', in: 'query', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal akhir.' }], responseExample: { days: [{ date: '2026-10-15', schedule: { kind: 'work', startTime: '08:00', endTime: '17:00' }, record: { clockInTime: '07:58', clockOutTime: '17:04', status: 'present' }, leave: null }] } },
      { id: 'attendance-employee', method: 'GET', path: '/attendance/employees/{id}', summary: 'Kalender absensi satu karyawan', auth: 'bearer-or-apikey', enterprise: true, params: [ID('Id karyawan.'), { name: 'from', in: 'query', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal awal.' }, { name: 'to', in: 'query', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal akhir.' }], responseExample: { days: [{ date: '2026-10-15', schedule: { kind: 'work', startTime: '08:00', endTime: '17:00' }, record: { clockInTime: '07:58', clockOutTime: '17:04', status: 'present' }, leave: null }] } },
      { id: 'holidays', method: 'GET', path: '/holidays', summary: 'Hari libur perusahaan', description: 'Libur nasional & cuti bersama yang diimpor perusahaan, serta libur kantor.', auth: 'bearer-or-apikey', enterprise: true, params: [{ name: 'year', in: 'query', type: 'integer', description: 'Tahun; bawaan tahun ini.' }], responseExample: [{ id: 'cm0hol', date: '2026-03-21', name: 'Idul Fitri 1447 H', isCollectiveLeave: false, branchId: null }] }
    ]
  },
  {
    id: 'leave',
    title: 'Cuti',
    description: 'Saldo cuti berupa buku besar; jumlah hari dihitung server dari jadwal & hari libur.',
    endpoints: [
      { id: 'leave-requests', method: 'GET', path: '/leave/requests', summary: 'Daftar pengajuan cuti', auth: 'bearer-or-apikey', enterprise: true, paginated: true, params: [...PAGE_PARAMS, { name: 'status', in: 'query', type: 'string', description: 'pending | approved | rejected | cancelled.' }, { name: 'from', in: 'query', type: 'string (YYYY-MM-DD)', description: 'Berakhir pada/setelah tanggal ini.' }, { name: 'to', in: 'query', type: 'string (YYYY-MM-DD)', description: 'Mulai pada/sebelum tanggal ini.' }], responseExample: { data: [{ id: 'cm0leave', code: 'CT-261015-0001', leaveTypeName: 'Cuti tahunan', employee: { id: 'cm0employee000000000000001', fullName: 'Budi Santoso', employeeNumber: 'EMP-0004' }, startDate: '2026-10-26', endDate: '2026-10-28', days: 3, status: 'pending' }], meta: META } },
      { id: 'leave-decide', method: 'POST', path: '/leave/requests/{id}/decide', summary: 'Setujui / tolak cuti', description: 'Hanya untuk penyetuju langkah aktif (atasan langsung atau Admin HR).', auth: 'bearer', params: [ID('Id pengajuan.')], body: [{ name: 'decision', type: 'string', required: true, description: 'approved | rejected.' }, { name: 'note', type: 'string', description: 'Catatan / alasan.' }], responseExample: { status: 'approved' } },
      { id: 'me-leave', method: 'GET', path: '/me/leave', summary: 'Saldo & pengajuan cuti saya', auth: 'bearer', responseExample: { year: 2026, balances: [{ code: 'ANNUAL', name: 'Cuti tahunan', entitled: 12, used: 3, pending: 0, available: 9 }], items: [] } },
      { id: 'me-leave-create', method: 'POST', path: '/me/leave', summary: 'Ajukan cuti', auth: 'bearer', errors: ['INSUFFICIENT_BALANCE', 'CONFLICT'], body: [{ name: 'leaveTypeId', type: 'string', required: true, description: 'Jenis cuti.' }, { name: 'startDate', type: 'string (YYYY-MM-DD)', required: true, description: 'Mulai.' }, { name: 'endDate', type: 'string (YYYY-MM-DD)', required: true, description: 'Selesai.' }, { name: 'halfDay', type: 'boolean', description: 'Setengah hari (satu tanggal).' }, { name: 'reason', type: 'string', description: 'Alasan.' }], responseExample: { id: 'cm0leave', code: 'CT-261015-0002', days: 2 } }
    ]
  },
  {
    id: 'requests',
    title: 'Lembur & reimbursement',
    description: 'Lembur dihitung per PP 35/2021 dan dibayar lewat payroll; reimbursement disetujui lalu dibayar bersama gaji. Persetujuan hanya oleh penyetuju langkah aktif (token login).',
    endpoints: [
      { id: 'overtime-requests', method: 'GET', path: '/overtime/requests', summary: 'Daftar pengajuan lembur', auth: 'bearer-or-apikey', enterprise: true, paginated: true, params: [...PAGE_PARAMS, { name: 'status', in: 'query', type: 'string', description: 'pending | approved | rejected | cancelled.' }, { name: 'from', in: 'query', type: 'string (YYYY-MM-DD)', description: 'Dari tanggal.' }, { name: 'to', in: 'query', type: 'string (YYYY-MM-DD)', description: 'Sampai tanggal.' }], responseExample: { data: [{ id: 'cm0ot', code: 'LB-261015-0001', workDate: '2026-10-15', startTime: '17:00', endTime: '19:00', minutes: 120, dayType: 'workday', reason: 'Tutup buku bulanan', status: 'pending', paid: false, employee: { id: 'cm0employee000000000000001', fullName: 'Budi Santoso', employeeNumber: 'EMP-0004' } }], meta: META } },
      { id: 'overtime-decide', method: 'POST', path: '/overtime/requests/{id}/decide', summary: 'Setujui / tolak lembur', auth: 'bearer', params: [ID('Id pengajuan.')], body: [{ name: 'decision', type: 'string', required: true, description: 'approved | rejected.' }, { name: 'note', type: 'string', description: 'Catatan / alasan.' }], responseExample: { status: 'approved' } },
      { id: 'me-overtime', method: 'GET', path: '/me/overtime', summary: 'Pengajuan lembur saya', auth: 'bearer', responseExample: { items: [{ id: 'cm0ot', code: 'LB-261015-0001', workDate: '2026-10-15', startTime: '17:00', endTime: '19:00', minutes: 120, dayType: 'workday', reason: 'Tutup buku bulanan', status: 'pending', paid: false, employee: { id: 'cm0employee000000000000001', fullName: 'Budi Santoso', employeeNumber: 'EMP-0004' } }] } },
      { id: 'me-overtime-create', method: 'POST', path: '/me/overtime', summary: 'Ajukan lembur', auth: 'bearer', errors: ['PLAN_REQUIRED', 'CONFLICT'], body: [{ name: 'workDate', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal kerja.' }, { name: 'startTime', type: 'string (HH:mm)', required: true, description: 'Mulai (waktu kantor).' }, { name: 'endTime', type: 'string (HH:mm)', required: true, description: 'Selesai.' }, { name: 'reason', type: 'string', required: true, description: 'Pekerjaan yang dilakukan.' }], responseExample: { id: 'cm0ot', code: 'LB-261015-0001', workDate: '2026-10-15', startTime: '17:00', endTime: '19:00', minutes: 120, dayType: 'workday', reason: 'Tutup buku bulanan', status: 'pending', paid: false, employee: { id: 'cm0employee000000000000001', fullName: 'Budi Santoso', employeeNumber: 'EMP-0004' } } },
      { id: 'reimbursements', method: 'GET', path: '/reimbursements', summary: 'Daftar reimbursement', auth: 'bearer-or-apikey', enterprise: true, paginated: true, params: [...PAGE_PARAMS, { name: 'status', in: 'query', type: 'string', description: 'pending | approved | rejected | cancelled.' }, { name: 'from', in: 'query', type: 'string (YYYY-MM-DD)', description: 'Dari tanggal.' }, { name: 'to', in: 'query', type: 'string (YYYY-MM-DD)', description: 'Sampai tanggal.' }], responseExample: { data: [{ id: 'cm0rb', code: 'RB-261015-0001', category: 'transport', categoryLabel: 'Transportasi', expenseDate: '2026-10-14', amount: 150000, approvedAmount: null, description: 'Taksi ke klien', hasReceipt: true, status: 'pending', paid: false, employee: { id: 'cm0employee000000000000001', fullName: 'Budi Santoso', employeeNumber: 'EMP-0004' } }], meta: META } },
      { id: 'reimbursement-decide', method: 'POST', path: '/reimbursements/{id}/decide', summary: 'Setujui / tolak reimbursement', auth: 'bearer', params: [ID('Id reimbursement.')], body: [{ name: 'decision', type: 'string', required: true, description: 'approved | rejected.' }, { name: 'note', type: 'string', description: 'Catatan / alasan.' }, { name: 'approvedAmount', type: 'number', description: 'Nominal disetujui bila berbeda.' }], responseExample: { status: 'approved' } },
      { id: 'me-reimbursements', method: 'GET', path: '/me/reimbursements', summary: 'Reimbursement saya', auth: 'bearer', responseExample: { items: [{ id: 'cm0rb', code: 'RB-261015-0001', category: 'transport', categoryLabel: 'Transportasi', expenseDate: '2026-10-14', amount: 150000, approvedAmount: null, description: 'Taksi ke klien', hasReceipt: true, status: 'pending', paid: false, employee: { id: 'cm0employee000000000000001', fullName: 'Budi Santoso', employeeNumber: 'EMP-0004' } }] } },
      { id: 'me-reimbursement-create', method: 'POST', path: '/me/reimbursements', summary: 'Ajukan reimbursement', auth: 'bearer', errors: ['PLAN_REQUIRED'], body: [{ name: 'category', type: 'string', required: true, description: 'Kategori reimbursement.' }, { name: 'expenseDate', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal pengeluaran.' }, { name: 'amount', type: 'number', required: true, description: 'Nominal rupiah (min. 1.000).' }, { name: 'description', type: 'string', required: true, description: 'Keterangan.' }], responseExample: { id: 'cm0rb', code: 'RB-261015-0001', category: 'transport', categoryLabel: 'Transportasi', expenseDate: '2026-10-14', amount: 150000, approvedAmount: null, description: 'Taksi ke klien', hasReceipt: true, status: 'pending', paid: false, employee: { id: 'cm0employee000000000000001', fullName: 'Budi Santoso', employeeNumber: 'EMP-0004' } } }
    ]
  },
  {
    id: 'documents',
    title: 'Dokumen',
    description: 'Dokumen karyawan disimpan privat. Tautan unduhan berlaku 5 menit dan setiap pembukaan dicatat; API key memerlukan scope `sensitive`.',
    endpoints: [
      { id: 'documents', method: 'GET', path: '/documents', summary: 'Daftar dokumen', auth: 'bearer-or-apikey', enterprise: true, paginated: true, params: [...PAGE_PARAMS, { name: 'employeeId', in: 'query', type: 'string', description: 'Filter karyawan.' }, { name: 'category', in: 'query', type: 'string', description: 'Kategori dokumen.' }], responseExample: { data: [{ id: 'cm0doc', category: 'contract', categoryLabel: 'Kontrak kerja', title: 'PKWT 2026', expiresAt: '2027-03-31', visibleToEmployee: true, employee: { id: 'cm0employee000000000000001', fullName: 'Budi Santoso', employeeNumber: 'EMP-0004' } }], meta: META } },
      { id: 'document-url', method: 'GET', path: '/documents/{id}/url', summary: 'Tautan unduh dokumen (5 menit)', auth: 'bearer-or-apikey', enterprise: true, params: [ID('Id dokumen.')], errors: ['FORBIDDEN'], responseExample: { url: 'https://example.private.blob.vercel-storage.com/...', expiresInSeconds: 300, contentType: 'application/pdf', name: 'pkwt-2026.pdf' } }
    ]
  },
  {
    id: 'reports',
    title: 'Laporan & kinerja',
    description: 'Ringkasan untuk dashboard/BI. Rentang dijepit ke riwayat laporan paket.',
    endpoints: [
      { id: 'report-headcount', method: 'GET', path: '/reports/headcount', summary: 'Laporan headcount & turnover', auth: 'bearer-or-apikey', enterprise: true, params: [{ name: 'from', in: 'query', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal awal.' }, { name: 'to', in: 'query', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal akhir.' }], responseExample: { clamped: false, from: '2026-10-01', active: 10, joiners: 1, leavers: 0, turnoverPercent: 0, byBranch: [{ key: 'cm0branch0000000000000001', label: 'Kantor Pusat', count: 10 }] } },
      { id: 'report-attendance', method: 'GET', path: '/reports/attendance', summary: 'Rekap absensi per karyawan', auth: 'bearer-or-apikey', enterprise: true, params: [{ name: 'from', in: 'query', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal awal.' }, { name: 'to', in: 'query', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal akhir.' }], responseExample: { clamped: false, from: '2026-10-01', items: [{ employeeNumber: 'EMP-0004', fullName: 'Budi Santoso', scheduledDays: 21, presentDays: 20, lateDays: 1, absentDays: 0, leaveDays: 1, lateMinutes: 12 }] } },
      { id: 'performance-cycles', method: 'GET', path: '/performance/cycles', summary: 'Siklus penilaian kinerja', auth: 'bearer-or-apikey', enterprise: true, errors: ['PLAN_REQUIRED'], responseExample: [{ id: 'cm0cycle', name: 'Penilaian 2026 H2', startDate: '2026-07-01', endDate: '2026-12-31', status: 'active' }] },
      { id: 'performance-reviews', method: 'GET', path: '/performance/cycles/{id}/reviews', summary: 'Penilaian dalam satu siklus', auth: 'bearer-or-apikey', enterprise: true, params: [ID('Id siklus.')], responseExample: [{ id: 'cm0review', employee: { id: 'cm0employee000000000000001', fullName: 'Budi Santoso' }, status: 'finalized', finalScore: 4.2 }] }
    ]
  },
  {
    id: 'payroll',
    title: 'Payroll',
    description: 'Run payroll & slip gaji. Nominal per orang adalah data gaji: API key memerlukan scope `sensitive`. Nexadream mencatat; transfer gaji dilakukan perusahaan.',
    endpoints: [
      { id: 'payroll-runs', method: 'GET', path: '/payroll/runs', summary: 'Daftar run payroll', auth: 'bearer-or-apikey', enterprise: true, paginated: true, params: PAGE_PARAMS.slice(0, 2), errors: ['PLAN_REQUIRED'], responseExample: { data: [{ id: 'cm0run', code: 'PR-202610-01', periodYear: 2026, periodMonth: 10, status: 'approved', employeeCount: 10, totalGross: 116394653, totalNet: 106410004, totalPph21: 6151227 }], meta: META } },
      { id: 'payroll-run', method: 'GET', path: '/payroll/runs/{id}', summary: 'Detail run + ringkasan slip', auth: 'bearer-or-apikey', enterprise: true, params: [ID('Id run.')], responseExample: { run: { id: 'cm0run', code: 'PR-202610-01', status: 'approved' }, payslips: [{ id: 'cm0slip', employeeNumber: 'EMP-0004', employeeName: 'Budi Santoso', gross: 8384653, pph21: 149787, net: 7948866 }] } },
      { id: 'me-payslips', method: 'GET', path: '/me/payslips', summary: 'Slip gaji saya', auth: 'bearer', responseExample: [{ id: 'cm0slip', code: 'SL-202610-0004', periodLabel: 'Oktober 2026', net: 7948866, paidDate: '2026-10-25' }] },
      { id: 'me-payslip', method: 'GET', path: '/me/payslips/{id}', summary: 'Rincian slip gaji saya', auth: 'bearer', params: [ID('Id slip.')], responseExample: { id: 'cm0slip', periodLabel: 'Oktober 2026', data: { gross: 8384653, net: 7948866, pph21: 149787, earnings: [{ code: 'BASIC', name: 'Gaji pokok', amount: 6500000 }], deductions: [{ code: 'PPH21', name: 'PPh 21', amount: 149787 }] } } }
    ]
  },
  {
    id: 'api-keys',
    title: 'API key',
    description: 'Dikelola pemilik perusahaan dengan token login (bukan dengan API key). Plaintext key hanya tampil sekali saat dibuat.',
    endpoints: [
      { id: 'api-keys-list', method: 'GET', path: '/api-keys', summary: 'Daftar API key', auth: 'bearer', responseExample: { items: [{ id: 'cm0key', name: 'Integrasi ERP', keyPrefix: 'hn_live_3f9a1c0b', scopes: ['read'], lastUsedAt: null, isActive: true }] } },
      { id: 'api-keys-create', method: 'POST', path: '/api-keys', summary: 'Buat API key', auth: 'bearer', errors: ['PLAN_REQUIRED'], body: [{ name: 'name', type: 'string', required: true, description: 'Nama integrasi.' }, { name: 'scopes', type: 'string[]', required: true, description: 'read (wajib), write, sensitive.' }], responseExample: { id: 'cm0key', name: 'Integrasi ERP', key: 'hn_live_3f9a1c0b…', scopes: ['read'] } },
      { id: 'api-keys-revoke', method: 'DELETE', path: '/api-keys/{id}', summary: 'Cabut API key', auth: 'bearer', params: [ID('Id key.')], responseExample: { success: true } }
    ]
  }
]

export const API_ERROR_CODE_DOCS: Array<{ code: string, status: number, meaning: string }> = [
  { code: 'VALIDATION_FAILED', status: 400, meaning: 'Input tidak valid (details.field), atau Content-Type bukan application/json (415).' },
  { code: 'UNAUTHENTICATED', status: 401, meaning: 'Token tidak ada / kedaluwarsa.' },
  { code: 'INVALID_API_KEY', status: 401, meaning: 'API key tidak dikenal atau sudah dicabut.' },
  { code: 'PLAN_REQUIRED', status: 402, meaning: 'Fitur tidak ada di paket perusahaan (details.feature).' },
  { code: 'LIMIT_REACHED', status: 402, meaning: 'Batas paket tercapai (details.limit, max, current).' },
  { code: 'FORBIDDEN', status: 403, meaning: 'Peran, scope API key (details.requiredScope), atau cakupan tidak mengizinkan.' },
  { code: 'TENANT_SUSPENDED', status: 403, meaning: 'Perusahaan ditangguhkan.' },
  { code: 'NOT_FOUND', status: 404, meaning: 'Data tidak ada atau di luar cakupan Anda.' },
  { code: 'CONFLICT', status: 409, meaning: 'Bentrok status/duplikat.' },
  { code: 'OUTSIDE_GEOFENCE', status: 400, meaning: 'Absen di luar radius kantor.' },
  { code: 'INSUFFICIENT_BALANCE', status: 400, meaning: 'Saldo cuti tidak cukup.' },
  { code: 'UPGRADE_REQUIRED', status: 426, meaning: 'Versi aplikasi mobile terlalu lama (details.minimumVersion).' },
  { code: 'RATE_LIMITED', status: 429, meaning: 'Terlalu banyak permintaan (details.retryAfterSeconds).' },
  { code: 'SERVER_ERROR', status: 500, meaning: 'Kesalahan server.' }
]

export function allEndpoints(): ApiEndpoint[] {
  return API_SECTIONS.flatMap(s => s.endpoints)
}

/** OpenAPI 3.1 dari katalog. scope 'public' = hanya endpoint enterprise. */
export function buildOpenApi(options: { serverUrl: string, version: string, scope: 'public' | 'internal' }) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const section of API_SECTIONS) {
    for (const e of section.endpoints) {
      if (options.scope === 'public' && !e.enterprise) continue
      const security = e.auth === 'none' ? [] : e.auth === 'bearer' ? [{ bearerAuth: [] }] : [{ bearerAuth: [] }, { apiKey: [] }]
      const op: Record<string, unknown> = {
        operationId: e.id,
        tags: [section.title],
        summary: e.summary,
        ...(e.description ? { description: e.description } : {}),
        security,
        parameters: (e.params ?? []).map(p => ({ name: p.name, in: p.in, required: p.in === 'path' ? true : !!p.required, description: p.description, schema: { type: p.type.startsWith('integer') ? 'integer' : 'string' }, ...(p.example ? { example: p.example } : {}) })),
        responses: {
          200: { description: 'OK', content: { [e.responseContentType ?? 'application/json']: { example: e.paginated ? e.responseExample : { data: e.responseExample } } } },
          default: { description: 'Galat', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
      if (e.body?.length) {
        op.requestBody = {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: e.body.filter(b => b.required).map(b => b.name), properties: Object.fromEntries(e.body.map(b => [b.name, { description: `${b.type} — ${b.description}` }])) } } }
        }
      }
      paths[e.path] = { ...(paths[e.path] ?? {}), [e.method.toLowerCase()]: op }
    }
  }
  return {
    openapi: '3.1.0',
    info: { title: 'HRIS Nexadream API', version: options.version, description: 'Respons dibungkus { data } / { data, meta } / { error }. Waktu dalam UTC ISO; tanggal kerja YYYY-MM-DD zona kantor; uang dalam rupiah bulat.' },
    servers: [{ url: `${options.serverUrl}${API_BASE_PATH}` }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' }, apiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' } },
      schemas: { Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string', enum: API_ERROR_CODE_DOCS.map(c => c.code) }, message: { type: 'string' }, status: { type: 'integer' }, details: { type: 'object' } } } } } }
    }
  }
}
