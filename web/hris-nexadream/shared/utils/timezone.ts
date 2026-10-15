// Kunci tanggal lokal "YYYY-MM-DD" dan konversinya ke instan UTC.
// Zona Indonesia (WIB/WITA/WIT) tidak punya DST, tetapi perhitungan tetap memakai Intl
// agar benar untuk zona apa pun.

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Tanggal lokal (YYYY-MM-DD) dari sebuah instan di zona `tz`. */
export function zonedDateKey(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function todayKey(tz: string): string {
  return zonedDateKey(new Date(), tz)
}

/** Selisih zona terhadap UTC (menit) pada instan tertentu. */
function offsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - instant.getTime()) / 60000)
}

/** Instan UTC dari pukul 00:00 tanggal `key` di zona `tz`. */
export function startOfZonedDay(key: string, tz: string): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const naive = Date.UTC(y, m - 1, d)
  const offset = offsetMinutes(new Date(naive), tz)
  return new Date(naive - offset * 60000)
}

/** Rentang setengah terbuka [awal, akhir) untuk satu hari lokal. */
export function zonedDayRange(key: string, tz: string): { gte: Date, lt: Date } {
  return { gte: startOfZonedDay(key, tz), lt: startOfZonedDay(addDaysToKey(key, 1), tz) }
}

export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

/** Instan UTC untuk tanggal lokal `key` pukul `time` (HH:mm) di zona `tz`. */
export function zonedInstant(key: string, time: string, tz: string): Date {
  const [h, m] = time.split(':').map(Number) as [number, number]
  return new Date(startOfZonedDay(key, tz).getTime() + (h * 60 + m) * 60000)
}

/** Hari dalam minggu (0 = Minggu) untuk tanggal kunci. */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Jam lokal HH:mm sebuah instan di zona `tz`. */
export function zonedTimeLabel(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant)
}

/** Daftar tanggal kunci dari `from` sampai `to` (inklusif). */
export function dateKeysBetween(from: string, to: string): string[] {
  const keys: string[] = []
  for (let key = from; key <= to && keys.length < 400; key = addDaysToKey(key, 1)) keys.push(key)
  return keys
}

/** Tanggal kolom @db.Date (UTC tengah malam) ↔ kunci. */
export function dateKeyToDb(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`)
}
export function dbDateToKey(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10)
}
