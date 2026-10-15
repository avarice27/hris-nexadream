// Aturan perhitungan payroll Indonesia — fungsi murni, diuji unit (tests/payroll-rules.test.ts).
// Tarif TIDAK di-hard-code di perhitungan: semuanya datang dari `PayrollReference`
// (tabel reference_data, diedit staf di /admin/reference-data). DEFAULT_PAYROLL_REFERENCE di bawah
// hanya nilai awal untuk migrasi/seed. PERLU DIVERIFIKASI konsultan pajak sebelum dipakai produksi (D20).
//
// Dasar hukum yang diikuti:
//  - PPh 21 tarif efektif rata-rata (TER) bulanan: PP 58/2023 + PMK 168/2023 (kategori A/B/C).
//  - Masa pajak terakhir (Desember / bulan berhenti): tarif Pasal 17 UU HPP atas PKP setahun.
//  - BPJS Kesehatan (Perpres 82/2018 jo. 64/2020), BPJS Ketenagakerjaan JHT/JP/JKK/JKM.
//  - Upah lembur: PP 35/2021 (1/173 upah sebulan per jam).
//  - THR: Permenaker 6/2016.

export interface RateBracket {
  /** Batas atas inklusif (rupiah); null = tanpa batas. */
  upTo: number | null
  /** Persen, mis. 0.25 = 0,25%. */
  rate: number
}

export type TerCategory = 'A' | 'B' | 'C'

export interface PtkpTable {
  base: number
  married: number
  perDependent: number
  maxDependents: number
}

export interface BpjsRates {
  kesehatanCompany: number
  kesehatanEmployee: number
  /** Batas atas upah dasar BPJS Kesehatan. */
  kesehatanWageCap: number
  jhtCompany: number
  jhtEmployee: number
  jpCompany: number
  jpEmployee: number
  /** Batas atas upah dasar Jaminan Pensiun (berubah tiap tahun). */
  jpWageCap: number
  jkm: number
}

export interface PayrollReference {
  ter: Record<TerCategory, RateBracket[]>
  progressive: RateBracket[]
  ptkp: PtkpTable
  bpjs: BpjsRates
  /** Biaya jabatan: persen dari bruto, maksimum per bulan. */
  occupationalCostRate: number
  occupationalCostMaxMonthly: number
}

export const PTKP_STATUSES = ['TK0', 'TK1', 'TK2', 'TK3', 'K0', 'K1', 'K2', 'K3'] as const
export type PtkpStatus = (typeof PTKP_STATUSES)[number]

export const PTKP_LABELS: Record<PtkpStatus, string> = {
  TK0: 'TK/0 — lajang, tanpa tanggungan',
  TK1: 'TK/1 — lajang, 1 tanggungan',
  TK2: 'TK/2 — lajang, 2 tanggungan',
  TK3: 'TK/3 — lajang, 3 tanggungan',
  K0: 'K/0 — kawin, tanpa tanggungan',
  K1: 'K/1 — kawin, 1 tanggungan',
  K2: 'K/2 — kawin, 2 tanggungan',
  K3: 'K/3 — kawin, 3 tanggungan'
}

export function isPtkpStatus(value: unknown): value is PtkpStatus {
  return typeof value === 'string' && (PTKP_STATUSES as readonly string[]).includes(value)
}

/** Kategori TER menurut PP 58/2023: A = TK/0, TK/1, K/0; B = TK/2, TK/3, K/1, K/2; C = K/3. */
export function terCategory(status: PtkpStatus): TerCategory {
  if (status === 'TK0' || status === 'TK1' || status === 'K0') return 'A'
  if (status === 'K3') return 'C'
  return 'B'
}

export function ptkpAmount(status: PtkpStatus, table: PtkpTable): number {
  const married = status.startsWith('K')
  const dependents = Math.min(Number(status.slice(-1)), table.maxDependents)
  return table.base + (married ? table.married : 0) + dependents * table.perDependent
}

export function bracketRate(amount: number, brackets: RateBracket[]): number {
  for (const bracket of brackets) {
    if (bracket.upTo === null || amount <= bracket.upTo) return bracket.rate
  }
  return brackets.at(-1)?.rate ?? 0
}

/** PPh 21 bulanan metode TER: tarif × penghasilan bruto sebulan, dibulatkan ke bawah. */
export function monthlyTerTax(grossMonthly: number, status: PtkpStatus, ref: PayrollReference): { category: TerCategory, rate: number, tax: number } {
  const category = terCategory(status)
  const rate = grossMonthly > 0 ? bracketRate(grossMonthly, ref.ter[category]) : 0
  return { category, rate, tax: Math.floor((grossMonthly * rate) / 100) }
}

/** Pajak Pasal 17 progresif atas PKP setahun. */
export function progressiveTax(taxableIncome: number, brackets: RateBracket[]): number {
  let remaining = Math.max(0, taxableIncome)
  let lower = 0
  let tax = 0
  for (const bracket of brackets) {
    if (remaining <= 0) break
    const width = bracket.upTo === null ? remaining : Math.max(0, bracket.upTo - lower)
    const slice = Math.min(remaining, width)
    tax += (slice * bracket.rate) / 100
    remaining -= slice
    if (bracket.upTo !== null) lower = bracket.upTo
  }
  return Math.floor(tax)
}

export interface AnnualTaxInput {
  /** Bruto setahun (atau selama masa kerja tahun ini) termasuk bulan terakhir. */
  annualGross: number
  /** Iuran pensiun ditanggung karyawan setahun (JHT 2% + JP 1%). */
  annualEmployeePension: number
  /** Jumlah bulan bekerja di tahun ini (untuk batas biaya jabatan). */
  monthsWorked: number
  /** PPh 21 yang sudah dipotong Januari s.d. bulan sebelum masa terakhir. */
  taxWithheldBefore: number
  status: PtkpStatus
}

/** Masa pajak terakhir: PPh 21 setahun (Pasal 17) dikurangi yang sudah dipotong. Bisa negatif (lebih potong). */
export function finalPeriodTax(input: AnnualTaxInput, ref: PayrollReference) {
  const occupationalCost = Math.min(
    Math.floor((input.annualGross * ref.occupationalCostRate) / 100),
    ref.occupationalCostMaxMonthly * Math.max(1, Math.min(12, input.monthsWorked))
  )
  const netIncome = input.annualGross - occupationalCost - input.annualEmployeePension
  const ptkp = ptkpAmount(input.status, ref.ptkp)
  // PKP dibulatkan ke bawah ke ribuan penuh.
  const taxableIncome = Math.max(0, Math.floor((netIncome - ptkp) / 1000) * 1000)
  const annualTax = progressiveTax(taxableIncome, ref.progressive)
  return { occupationalCost, netIncome, ptkp, taxableIncome, annualTax, tax: annualTax - input.taxWithheldBefore }
}

export interface BpjsInput {
  /** Upah dasar BPJS: gaji pokok + tunjangan tetap. */
  wage: number
  kesehatanEnrolled: boolean
  ketenagakerjaanEnrolled: boolean
  pensionEnrolled: boolean
  /** Persen risiko JKK perusahaan. */
  jkkRate: number
}

export interface BpjsContribution {
  kesehatanCompany: number
  kesehatanEmployee: number
  jhtCompany: number
  jhtEmployee: number
  jpCompany: number
  jpEmployee: number
  jkk: number
  jkm: number
}

const pct = (base: number, rate: number) => Math.round((base * rate) / 100)

export function bpjsContributions(input: BpjsInput, rates: BpjsRates): BpjsContribution {
  const wage = Math.max(0, input.wage)
  const kesBase = Math.min(wage, rates.kesehatanWageCap)
  const jpBase = Math.min(wage, rates.jpWageCap)
  const tk = input.ketenagakerjaanEnrolled
  return {
    kesehatanCompany: input.kesehatanEnrolled ? pct(kesBase, rates.kesehatanCompany) : 0,
    kesehatanEmployee: input.kesehatanEnrolled ? pct(kesBase, rates.kesehatanEmployee) : 0,
    jhtCompany: tk ? pct(wage, rates.jhtCompany) : 0,
    jhtEmployee: tk ? pct(wage, rates.jhtEmployee) : 0,
    jpCompany: tk && input.pensionEnrolled ? pct(jpBase, rates.jpCompany) : 0,
    jpEmployee: tk && input.pensionEnrolled ? pct(jpBase, rates.jpEmployee) : 0,
    jkk: tk ? pct(wage, input.jkkRate) : 0,
    jkm: tk ? pct(wage, rates.jkm) : 0
  }
}

export type OvertimeDayType = 'workday' | 'rest_day' | 'holiday'

/**
 * Pengali jam lembur PP 35/2021. Hari kerja: jam ke-1 ×1,5, berikutnya ×2.
 * Hari istirahat/libur (5 hari kerja/minggu): jam 1–8 ×2, jam ke-9 ×3, jam 10–11 ×4.
 * (6 hari kerja/minggu: jam 1–7 ×2, jam ke-8 ×3, jam 9–10 ×4.)
 */
export function overtimeMultiplierHours(minutes: number, dayType: OvertimeDayType, workDaysPerWeek: 5 | 6 = 5): number {
  const hours = Math.max(0, minutes) / 60
  const take = (from: number, to: number) => Math.max(0, Math.min(hours, to) - from)
  if (dayType === 'workday') return take(0, 1) * 1.5 + take(1, Infinity) * 2
  const normal = workDaysPerWeek === 5 ? 8 : 7
  return take(0, normal) * 2 + take(normal, normal + 1) * 3 + take(normal + 1, Infinity) * 4
}

/** Upah lembur = jam berpengali × 1/173 × upah sebulan. */
export function overtimePay(minutes: number, dayType: OvertimeDayType, monthlyWage: number, workDaysPerWeek: 5 | 6 = 5): number {
  return Math.round(overtimeMultiplierHours(minutes, dayType, workDaysPerWeek) * (monthlyWage / 173))
}

/** Batas lembur per hari (PP 35/2021: maks 4 jam pada hari kerja). */
export function maxOvertimeMinutes(dayType: OvertimeDayType): number {
  return dayType === 'workday' ? 4 * 60 : 11 * 60
}

/** Masa kerja dalam bulan penuh antara dua tanggal kunci (YYYY-MM-DD). */
export function fullMonthsBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = toKey.split('-').map(Number) as [number, number, number]
  let months = (ty - fy) * 12 + (tm - fm)
  if (td < fd) months -= 1
  return Math.max(0, months)
}

/** THR keagamaan: ≥12 bulan = 1× upah; 1–11 bulan = proporsional; < 1 bulan = 0. */
export function thrAmount(monthlyWage: number, joinDateKey: string, thrDateKey: string): { months: number, amount: number } {
  const months = fullMonthsBetween(joinDateKey, thrDateKey)
  if (months < 1) return { months, amount: 0 }
  if (months >= 12) return { months, amount: Math.round(monthlyWage) }
  return { months, amount: Math.round((months / 12) * monthlyWage) }
}

// ---------------------------------------------------------------------------
// Struktur slip gaji (disimpan terenkripsi di payslips.dataEncrypted)
// ---------------------------------------------------------------------------

export interface PayslipLine {
  code: string
  name: string
  amount: number
  /** Hanya untuk penghasilan: masuk bruto PPh 21. */
  taxable?: boolean
}

export interface PayslipData {
  period: { year: number, month: number }
  ptkpStatus: PtkpStatus
  baseSalary: number
  earnings: PayslipLine[]
  deductions: PayslipLine[]
  /** Iuran yang ditanggung perusahaan (informasi, tidak memotong gaji). */
  employer: PayslipLine[]
  gross: number
  totalDeductions: number
  net: number
  /** Penghasilan bruto untuk PPh 21 (termasuk premi JKK/JKM/BPJS Kes perusahaan). */
  taxableGross: number
  pph21: number
  pph21Method: 'ter' | 'final_period'
  terCategory: TerCategory
  terRate: number
  employeePension: number
  attendance: { scheduledDays: number, presentDays: number, lateDays: number, absentDays: number, leaveDays: number }
  overtimeMinutes: number
  notes: string[]
}

// ---------------------------------------------------------------------------
// Nilai awal referensi (PERLU VERIFIKASI — D20). Disalin ke reference_data oleh migrasi.
// ---------------------------------------------------------------------------

const b = (pairs: Array<[number | null, number]>): RateBracket[] => pairs.map(([upTo, rate]) => ({ upTo, rate }))

export const DEFAULT_TER_TABLES: Record<TerCategory, RateBracket[]> = {
  A: b([
    [5_400_000, 0], [5_650_000, 0.25], [5_950_000, 0.5], [6_300_000, 0.75], [6_750_000, 1], [7_500_000, 1.25],
    [8_550_000, 1.5], [9_650_000, 1.75], [10_050_000, 2], [10_350_000, 2.25], [10_700_000, 2.5], [11_050_000, 3],
    [11_600_000, 3.5], [12_500_000, 4], [13_750_000, 5], [15_100_000, 6], [16_950_000, 7], [19_750_000, 8],
    [24_150_000, 9], [26_450_000, 10], [28_000_000, 11], [30_050_000, 12], [32_400_000, 13], [35_400_000, 14],
    [39_100_000, 15], [43_850_000, 16], [47_800_000, 17], [51_400_000, 18], [56_300_000, 19], [62_200_000, 20],
    [68_600_000, 21], [77_500_000, 22], [89_000_000, 23], [103_000_000, 24], [125_000_000, 25], [157_000_000, 26],
    [206_000_000, 27], [337_000_000, 28], [454_000_000, 29], [550_000_000, 30], [695_000_000, 31], [910_000_000, 32],
    [1_400_000_000, 33], [null, 34]
  ]),
  B: b([
    [6_200_000, 0], [6_500_000, 0.25], [6_850_000, 0.5], [7_300_000, 0.75], [9_200_000, 1], [10_750_000, 1.5],
    [11_250_000, 2], [11_600_000, 2.5], [12_600_000, 3], [13_600_000, 4], [14_950_000, 5], [16_400_000, 6],
    [18_450_000, 7], [21_850_000, 8], [26_000_000, 9], [27_700_000, 10], [29_350_000, 11], [31_450_000, 12],
    [33_950_000, 13], [37_100_000, 14], [41_100_000, 15], [45_800_000, 16], [49_500_000, 17], [53_800_000, 18],
    [58_500_000, 19], [64_000_000, 20], [71_000_000, 21], [80_000_000, 22], [93_000_000, 23], [109_000_000, 24],
    [129_000_000, 25], [163_000_000, 26], [211_000_000, 27], [374_000_000, 28], [459_000_000, 29], [555_000_000, 30],
    [704_000_000, 31], [957_000_000, 32], [1_405_000_000, 33], [null, 34]
  ]),
  C: b([
    [6_600_000, 0], [6_950_000, 0.25], [7_350_000, 0.5], [7_800_000, 0.75], [8_850_000, 1], [9_800_000, 1.25],
    [10_950_000, 1.5], [11_200_000, 1.75], [12_050_000, 2], [12_950_000, 3], [14_150_000, 4], [15_550_000, 5],
    [17_050_000, 6], [19_500_000, 7], [22_700_000, 8], [26_600_000, 9], [28_100_000, 10], [30_100_000, 11],
    [32_600_000, 12], [35_400_000, 13], [38_900_000, 14], [43_000_000, 15], [47_400_000, 16], [51_200_000, 17],
    [55_800_000, 18], [60_400_000, 19], [66_700_000, 20], [74_500_000, 21], [83_200_000, 22], [95_600_000, 23],
    [110_000_000, 24], [134_000_000, 25], [169_000_000, 26], [221_000_000, 27], [390_000_000, 28], [463_000_000, 29],
    [561_000_000, 30], [709_000_000, 31], [965_000_000, 32], [1_419_000_000, 33], [null, 34]
  ])
}

export const DEFAULT_PAYROLL_REFERENCE: PayrollReference = {
  ter: DEFAULT_TER_TABLES,
  // UU HPP (UU 7/2021) Pasal 17 ayat (1) huruf a
  progressive: b([[60_000_000, 5], [250_000_000, 15], [500_000_000, 25], [5_000_000_000, 30], [null, 35]]),
  ptkp: { base: 54_000_000, married: 4_500_000, perDependent: 4_500_000, maxDependents: 3 },
  bpjs: {
    kesehatanCompany: 4,
    kesehatanEmployee: 1,
    kesehatanWageCap: 12_000_000,
    jhtCompany: 3.7,
    jhtEmployee: 2,
    jpCompany: 2,
    jpEmployee: 1,
    // Batas upah JP 2025 — diperbarui tiap tahun oleh BPJS Ketenagakerjaan.
    jpWageCap: 10_547_400,
    jkm: 0.3
  },
  occupationalCostRate: 5,
  occupationalCostMaxMonthly: 500_000
}

/** Kunci reference_data untuk payroll. */
export const PAYROLL_REFERENCE_KEY = 'payroll'
