import type { UploadVisibility } from '#shared/utils/uploads'
import type { StorageDriver } from './types'

// Supabase Storage lewat REST API (tanpa SDK). Dua bucket: publik dan privat.
const env = () => ({
  url: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  key: process.env.SUPABASE_SECRET_KEY || '',
  publicBucket: process.env.SUPABASE_STORAGE_BUCKET || 'public',
  privateBucket: process.env.SUPABASE_PRIVATE_BUCKET || 'private'
})

const bucketFor = (visibility: UploadVisibility) => visibility === 'private' ? env().privateBucket : env().publicBucket
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

async function call(path: string, init: RequestInit) {
  const { url, key } = env()
  const response = await fetch(`${url}/storage/v1/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, apikey: key, ...(init.headers as Record<string, string> | undefined) }
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Storage request failed (${response.status}): ${text.slice(0, 200)}`)
  }
  return response
}

export const supabaseStorage: StorageDriver = {
  provider: 'supabase',

  isConfigured() {
    const { url, key } = env()
    return !!url && !!key
  },

  async upload({ visibility, path, body, contentType, cacheControl }) {
    await call(`object/${bucketFor(visibility)}/${encodePath(path)}`, {
      method: 'POST',
      headers: { 'content-type': contentType, 'cache-control': cacheControl ?? 'max-age=31536000', 'x-upsert': 'false' },
      body: body as BodyInit
    })
  },

  async delete(visibility, path) {
    await call(`object/${bucketFor(visibility)}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefixes: [path] })
    })
  },

  async signedUrl(path, ttlSeconds) {
    const response = await call(`object/sign/${env().privateBucket}/${encodePath(path)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn: ttlSeconds })
    })
    const data = await response.json() as { signedURL?: string, signedUrl?: string }
    const signed = data.signedURL ?? data.signedUrl
    if (!signed) throw new Error('Storage did not return a signed URL.')
    return `${env().url}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`
  },

  publicUrl(path) {
    return `${env().url}/storage/v1/object/public/${env().publicBucket}/${encodePath(path)}`
  }
}
