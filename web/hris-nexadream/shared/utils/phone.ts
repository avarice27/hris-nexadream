// Nomor telepon Indonesia disimpan dalam format 62xxxxxxxxxx.

export function normalizeIndonesianPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`
  else if (digits.startsWith('8')) digits = `62${digits}`
  return digits
}

export function isValidIndonesianPhone(raw: string): boolean {
  return /^628\d{7,11}$/.test(normalizeIndonesianPhone(raw))
}

export function formatPhone(stored: string | null | undefined): string {
  if (!stored) return ''
  const digits = stored.replace(/\D/g, '')
  if (!digits.startsWith('62')) return stored
  const local = digits.slice(2)
  return `+62 ${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`.replace(/-$/, '')
}
