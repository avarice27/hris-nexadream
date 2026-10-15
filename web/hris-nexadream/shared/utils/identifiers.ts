// Validasi nomor identitas Indonesia (format saja; tidak memeriksa ke DJP/Dukcapil).

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** NPWP lama 15 digit atau NPWP 16 digit (berbasis NIK, berlaku sejak 2024). */
export function isValidNpwp(value: string): boolean {
  const digits = digitsOnly(value)
  return digits.length === 15 || digits.length === 16
}

/** 01.234.567.8-901.000 untuk 15 digit; 16 digit ditampilkan apa adanya. */
export function formatNpwp(value: string): string {
  const d = digitsOnly(value)
  if (d.length !== 15) return d
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}.${d.slice(8, 9)}-${d.slice(9, 12)}.${d.slice(12, 15)}`
}

export const WEEKDAY_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const

export interface WorkCalendar {
  workingDays: number[]
  startTime: string
  endTime: string
  breakMinutes: number
}

export interface LeavePolicyItem {
  code: string
  name: string
  days: number | null
  eligibleAfterMonths: number
}

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
