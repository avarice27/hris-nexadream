import type { UploadVisibility } from '#shared/utils/uploads'
import { localStorageDriver } from './local'
import { s3Storage } from './s3'
import { supabaseStorage } from './supabase'
import type { StorageDriver } from './types'
import { vercelBlobStorage } from './vercel-blob'

// Fasad penyimpanan — satu-satunya titik impor untuk kode bisnis.
// STORAGE_PROVIDER = 'vercel_blob' (bawaan) | 'supabase' | 's3' | 'local'. Di development, bila driver terpilih belum
// dikonfigurasi, otomatis jatuh ke 'local' agar unggahan tetap bisa diuji.

const drivers: Record<string, StorageDriver> = {
  [vercelBlobStorage.provider]: vercelBlobStorage,
  [supabaseStorage.provider]: supabaseStorage,
  [s3Storage.provider]: s3Storage,
  [localStorageDriver.provider]: localStorageDriver
}

export function getStorageDriver(): StorageDriver {
  const name = process.env.STORAGE_PROVIDER || 'vercel_blob'
  const driver = drivers[name]
  if (!driver) throw new Error(`Unknown STORAGE_PROVIDER "${name}".`)
  if (driver.isConfigured()) return driver
  if (process.env.NODE_ENV !== 'production') return localStorageDriver
  throw httpError(503, 'INTERNAL', 'Penyimpanan file belum dikonfigurasi. Hubungi tim dukungan.')
}

export async function uploadObject(input: { visibility: UploadVisibility, path: string, body: Uint8Array, contentType: string }) {
  const driver = getStorageDriver()
  await driver.upload(input)
  return { provider: driver.provider, url: input.visibility === 'public' ? driver.publicUrl(input.path) : null }
}

/** Hapus objek dari driver yang menyimpannya. Tidak pernah melempar (dicatat). */
export async function deleteObject(provider: string, visibility: UploadVisibility, path: string) {
  try {
    await drivers[provider]?.delete(visibility, path)
  } catch (error) {
    console.error('[storage] delete failed', provider, path, error)
  }
}

/** Signed URL berumur pendek (maks 5 menit) untuk objek privat. Jangan disimpan atau dicatat. */
export async function getSignedObjectUrl(provider: string, path: string, ttlSeconds = 300) {
  const driver = drivers[provider]
  if (!driver) throw new Error(`Unknown storage provider "${provider}".`)
  return driver.signedUrl(path, Math.min(ttlSeconds, 300))
}

export function publicObjectUrl(provider: string, path: string) {
  const driver = drivers[provider]
  if (!driver) throw new Error(`Unknown storage provider "${provider}".`)
  return driver.publicUrl(path)
}
