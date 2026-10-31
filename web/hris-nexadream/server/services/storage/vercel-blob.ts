import { del, issueSignedToken, presignUrl, put, type IssuedSignedToken } from '@vercel/blob'
import type { UploadVisibility } from '#shared/utils/uploads'
import type { StorageDriver } from './types'

// Vercel Blob. Akses store ditetapkan saat dibuat, jadi dipakai DUA store:
//   publik  — logo perusahaan & avatar (URL CDN permanen)
//   privat  — dokumen karyawan, selfie absen, bukti reimbursement, file ekspor
// Kredensial per store: token read-write statis (BLOB_*_READ_WRITE_TOKEN) atau OIDC Vercel
// (BLOB_*_STORE_ID + VERCEL_OIDC_TOKEN yang diisi platform).
// Objek privat dibaca lewat presigned GET URL (≤ 5 menit) — byte tidak lewat function kita.

interface StoreCredentials { token?: string, storeId?: string }

const credentials = (visibility: UploadVisibility): StoreCredentials => {
  const prefix = visibility === 'private' ? 'BLOB_PRIVATE' : 'BLOB_PUBLIC'
  const token = process.env[`${prefix}_READ_WRITE_TOKEN`] || undefined
  const storeId = process.env[`${prefix}_STORE_ID`] || undefined
  return token ? { token } : { storeId }
}

const hasCredentials = (visibility: UploadVisibility) => {
  const c = credentials(visibility)
  return !!c.token || !!c.storeId
}

/** Id store dari env, atau diturunkan dari token `vercel_blob_rw_<storeId>_<secret>`. */
function storeIdFor(visibility: UploadVisibility) {
  const c = credentials(visibility)
  const raw = c.storeId ?? c.token?.split('_')[3] ?? ''
  return raw.replace(/^store_/, '').toLowerCase()
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

// Token penandatangan di-cache per instance (best-effort); dibuat ulang 10 menit sebelum kedaluwarsa.
let signingToken: IssuedSignedToken | null = null

async function privateSigningToken() {
  if (signingToken && signingToken.validUntil - Date.now() > 10 * 60_000) return signingToken
  signingToken = await issueSignedToken({ pathname: '*', operations: ['get'], validUntil: Date.now() + 60 * 60_000, ...credentials('private') })
  return signingToken
}

export const vercelBlobStorage: StorageDriver = {
  provider: 'vercel_blob',

  isConfigured() {
    return hasCredentials('public') && hasCredentials('private')
  },

  async upload({ visibility, path, body, contentType, cacheControl }) {
    const maxAge = Number(/max-age=(\d+)/.exec(cacheControl ?? '')?.[1] ?? 31536000)
    await put(path, Buffer.from(body), {
      access: visibility,
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: maxAge,
      ...credentials(visibility)
    })
  },

  async delete(visibility, path) {
    await del(path, credentials(visibility))
  },

  async signedUrl(path, ttlSeconds) {
    const token = await privateSigningToken()
    const { presignedUrl } = await presignUrl(token, {
      operation: 'get',
      pathname: path,
      access: 'private',
      validUntil: Date.now() + ttlSeconds * 1000
    })
    return presignedUrl
  },

  publicUrl(path) {
    const base = (process.env.BLOB_PUBLIC_BASE_URL || `https://${storeIdFor('public')}.public.blob.vercel-storage.com`).replace(/\/$/, '')
    return `${base}/${encodePath(path)}`
  }
}
