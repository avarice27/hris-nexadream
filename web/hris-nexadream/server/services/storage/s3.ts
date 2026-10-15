import { AwsClient } from 'aws4fetch'
import type { UploadVisibility } from '#shared/utils/uploads'
import type { StorageDriver } from './types'

// S3-kompatibel (AWS S3, Cloudflare R2, MinIO) lewat aws4fetch — penanda tangan SigV4 kecil
// berbasis fetch, cocok untuk Vercel serverless.
const env = () => ({
  accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  region: process.env.S3_REGION || 'auto',
  endpoint: (process.env.S3_ENDPOINT || '').replace(/\/$/, ''),
  publicBucket: process.env.S3_BUCKET || '',
  privateBucket: process.env.S3_PRIVATE_BUCKET || process.env.S3_BUCKET || '',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  publicUrlBase: (process.env.S3_PUBLIC_URL_BASE || '').replace(/\/$/, '')
})

let client: AwsClient | null = null
function aws(): AwsClient {
  const e = env()
  client ??= new AwsClient({ accessKeyId: e.accessKeyId, secretAccessKey: e.secretAccessKey, region: e.region, service: 's3' })
  return client
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

function objectUrl(visibility: UploadVisibility, path: string): string {
  const e = env()
  const bucket = visibility === 'private' ? e.privateBucket : e.publicBucket
  const endpoint = e.endpoint || `https://s3.${e.region}.amazonaws.com`
  if (e.forcePathStyle) return `${endpoint}/${bucket}/${encodePath(path)}`
  const host = new URL(endpoint)
  return `${host.protocol}//${bucket}.${host.host}/${encodePath(path)}`
}

async function send(url: string, init: RequestInit) {
  const response = await aws().fetch(url, init)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Storage request failed (${response.status}): ${text.slice(0, 200)}`)
  }
}

export const s3Storage: StorageDriver = {
  provider: 's3',

  isConfigured() {
    const e = env()
    return !!e.accessKeyId && !!e.secretAccessKey && !!e.publicBucket
  },

  async upload({ visibility, path, body, contentType, cacheControl }) {
    await send(objectUrl(visibility, path), {
      method: 'PUT',
      headers: { 'content-type': contentType, 'cache-control': cacheControl ?? 'max-age=31536000' },
      body: body as BodyInit
    })
  },

  async delete(visibility, path) {
    await send(objectUrl(visibility, path), { method: 'DELETE' })
  },

  async signedUrl(path, ttlSeconds) {
    const url = new URL(objectUrl('private', path))
    url.searchParams.set('X-Amz-Expires', String(ttlSeconds))
    const signed = await aws().sign(url.toString(), { method: 'GET', aws: { signQuery: true } })
    return signed.url
  },

  publicUrl(path) {
    const base = env().publicUrlBase
    return base ? `${base}/${encodePath(path)}` : objectUrl('public', path)
  }
}
