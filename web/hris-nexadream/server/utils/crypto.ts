import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// Enkripsi data rahasia saat disimpan (AES-256-GCM). Dua kunci terpisah:
//  - 'settings': rahasia platform (SMTP, gateway) — dari SETTINGS_SECRET (fallback JWT_SECRET)
//  - 'hr': data sensitif karyawan (NIK, NPWP, gaji…, D7) — dari HR_DATA_KEY (fallback SETTINGS_SECRET)

export type KeyId = 'settings' | 'hr'

const PREFIX = 'enc:v1:'
const keyCache = new Map<KeyId, Buffer>()

function secretFor(keyId: KeyId): string {
  const settings = process.env.SETTINGS_SECRET || process.env.JWT_SECRET || ''
  const secret = keyId === 'hr' ? (process.env.HR_DATA_KEY || settings) : settings
  if (!secret) throw new Error(`Encryption key for "${keyId}" is not configured.`)
  return secret
}

function keyFor(keyId: KeyId): Buffer {
  let key = keyCache.get(keyId)
  if (!key) {
    key = scryptSync(secretFor(keyId), `hrisnexadream.${keyId}.v1`, 32)
    keyCache.set(keyId, key)
  }
  return key
}

export function encrypt(plain: string, keyId: KeyId = 'settings'): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFor(keyId), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

/** Nilai tanpa prefiks diteruskan apa adanya; '' bila gagal (mis. kunci sudah dirotasi). */
export function decrypt(value: string | null | undefined, keyId: KeyId = 'settings'): string {
  if (!value) return ''
  if (!isEncrypted(value)) return value
  try {
    const [ivPart, tagPart, dataPart] = value.slice(PREFIX.length).split(':')
    if (!ivPart || !tagPart || !dataPart) return ''
    const decipher = createDecipheriv('aes-256-gcm', keyFor(keyId), Buffer.from(ivPart, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return ''
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

/** Masking untuk nomor identitas (NIK, NPWP, rekening): sisakan 4 digit awal & akhir. */
export function maskIdentifier(value: string | null | undefined): string {
  if (!value) return ''
  const digits = value.replace(/\s/g, '')
  if (digits.length <= 8) return '•'.repeat(digits.length)
  return `${digits.slice(0, 4)}${'•'.repeat(digits.length - 8)}${digits.slice(-4)}`
}
