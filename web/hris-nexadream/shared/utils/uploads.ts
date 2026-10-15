// Aturan unggahan, dipakai browser dan server (server adalah otoritasnya).
// Tipe file dideteksi dari magic bytes, bukan dari nama/ekstensi. SVG tidak pernah diizinkan (XSS).

export type UploadVisibility = 'public' | 'private'

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const

export interface UploadPurposeDef {
  label: string
  visibility: UploadVisibility
  allowedTypes: readonly string[]
  maxBytes: number
  /** Ukuran sisi terpanjang setelah browser mengecilkan gambar (null = tidak dikecilkan). */
  clientResizePx: number | null
}

export const UPLOAD_PURPOSES = {
  company_logo: { label: 'Logo perusahaan', visibility: 'public', allowedTypes: IMAGE_TYPES, maxBytes: 512 * 1024, clientResizePx: 512 },
  avatar: { label: 'Foto profil', visibility: 'public', allowedTypes: IMAGE_TYPES, maxBytes: 200 * 1024, clientResizePx: 512 },
  // Brankas dokumen karyawan (fase 11.8): privat, hanya lewat signed URL ≤ 5 menit.
  document: { label: 'Dokumen', visibility: 'private', allowedTypes: DOCUMENT_TYPES, maxBytes: 10 * 1024 * 1024, clientResizePx: null },
  // Selfie absen (fitur attendanceGeofence): privat, dikecilkan di browser.
  attendance_photo: { label: 'Foto absen', visibility: 'private', allowedTypes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 400 * 1024, clientResizePx: 720 },
  // Struk reimbursement & lampiran cuti (surat dokter): privat.
  receipt: { label: 'Bukti / lampiran', visibility: 'private', allowedTypes: DOCUMENT_TYPES, maxBytes: 5 * 1024 * 1024, clientResizePx: 1600 }
} as const satisfies Record<string, UploadPurposeDef>

export type UploadPurpose = keyof typeof UPLOAD_PURPOSES

export const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf'
}

/** Deteksi tipe dari magic bytes. null = tidak dikenal (ditolak). */
export function sniffContentType(bytes: Uint8Array): string | null {
  const b = bytes
  if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return 'image/png'
  if (b.length >= 6) {
    const head = String.fromCharCode(...b.slice(0, 6))
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif'
  }
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp'
  if (b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === '%PDF-') return 'application/pdf'
  return null
}

/** Membuang segmen APP1–APP15 dan komentar dari JPEG (APP0/JFIF dipertahankan). */
export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (input[0] !== 0xFF || input[1] !== 0xD8) return input
  const out: number[] = [0xFF, 0xD8]
  let i = 2
  while (i + 4 <= input.length) {
    if (input[i] !== 0xFF) return input // struktur tak terduga: kembalikan apa adanya
    const marker = input[i + 1]!
    if (marker === 0xDA) { // SOS: sisanya data gambar
      for (let j = i; j < input.length; j++) out.push(input[j]!)
      return Uint8Array.from(out)
    }
    const length = (input[i + 2]! << 8) + input[i + 3]!
    const end = i + 2 + length
    if (end > input.length) return input
    const isMetadata = (marker >= 0xE1 && marker <= 0xEF) || marker === 0xFE
    if (!isMetadata) for (let j = i; j < end; j++) out.push(input[j]!)
    i = end
  }
  return input
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
