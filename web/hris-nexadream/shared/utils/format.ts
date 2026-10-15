// Format tampilan id-ID. Dipakai client (layar) dan server (email/notifikasi).

// Intl memakai spasi tak-putus (U+00A0 / U+202F); email & teks polos memakai spasi biasa.
const NBSP = new RegExp(`[${String.fromCharCode(0xA0)}${String.fromCharCode(0x202F)}]`, 'g')

export function formatIDR(value: number | null | undefined): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
    .format(value ?? 0)
    .replace(NBSP, ' ')
}

/** 11 Agustus 2026 */
export function formatDateId(value: Date | string | null | undefined, timeZone = 'Asia/Jakarta'): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(value))
}

/** 11 Agustus 2026, 14.30 */
export function formatDateTimeId(value: Date | string | null | undefined, timeZone = 'Asia/Jakarta'): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone })
    .format(new Date(value))
    .replace(NBSP, ' ')
}

/** "2 jam lalu", "kemarin" */
export function formatRelativeId(value: Date | string | null | undefined, now = new Date()): string {
  if (!value) return ''
  const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' })
  const abs = Math.abs(seconds)
  if (abs < 60) return rtf.format(seconds, 'second')
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), 'day')
  if (abs < 86400 * 365) return rtf.format(Math.round(seconds / (86400 * 30)), 'month')
  return rtf.format(Math.round(seconds / (86400 * 365)), 'year')
}
