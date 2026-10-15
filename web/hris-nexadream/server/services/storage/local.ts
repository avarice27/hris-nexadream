import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import type { UploadVisibility } from '#shared/utils/uploads'
import type { StorageDriver } from './types'

// HANYA UNTUK DEVELOPMENT: menyimpan ke .data/uploads dan menyajikannya lewat /_dev-uploads.
// Vercel serverless tidak boleh menulis ke filesystem — driver ini menolak berjalan di produksi.

export const LOCAL_UPLOAD_ROOT = resolve(process.cwd(), '.data', 'uploads')

function assertDev() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Local storage driver is not allowed in production. Set STORAGE_PROVIDER and its credentials.')
  }
}

export function localFilePath(visibility: UploadVisibility, path: string): string {
  const full = resolve(LOCAL_UPLOAD_ROOT, visibility, path)
  if (!full.startsWith(resolve(LOCAL_UPLOAD_ROOT, visibility))) throw new Error('Invalid storage path.')
  return full
}

function signingKey(): string {
  return process.env.SETTINGS_SECRET || process.env.JWT_SECRET || 'dev-local-storage'
}

export function localSignature(path: string, expires: number): string {
  return createHmac('sha256', signingKey()).update(`${path}:${expires}`).digest('hex')
}

export const localStorageDriver: StorageDriver = {
  provider: 'local',

  isConfigured() {
    return process.env.NODE_ENV !== 'production'
  },

  async upload({ visibility, path, body }) {
    assertDev()
    const target = localFilePath(visibility, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, body)
  },

  async delete(visibility, path) {
    assertDev()
    await rm(localFilePath(visibility, path), { force: true })
  },

  async signedUrl(path, ttlSeconds) {
    assertDev()
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds
    return `/_dev-uploads/private/${path}?expires=${expires}&signature=${localSignature(path, expires)}`
  },

  publicUrl(path) {
    return `/_dev-uploads/public/${join(path).replace(/\\/g, '/')}`
  }
}
