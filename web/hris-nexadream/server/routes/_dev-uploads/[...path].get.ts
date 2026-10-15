import { readFile } from 'node:fs/promises'
import { EXTENSION_BY_TYPE } from '#shared/utils/uploads'
import { localFilePath, localSignature } from '../../services/storage/local'

// Penyaji file driver 'local' — HANYA development. Objek privat wajib bertanda tangan dan belum kedaluwarsa.
export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') throw notFound()
  const raw = getRouterParam(event, 'path') ?? ''
  const [visibility, ...rest] = raw.split('/')
  const path = rest.join('/')
  if ((visibility !== 'public' && visibility !== 'private') || !path) throw notFound()

  if (visibility === 'private') {
    const { expires, signature } = getQuery(event)
    const exp = Number(expires)
    if (!exp || exp < Date.now() / 1000 || typeof signature !== 'string' || !safeEqual(signature, localSignature(path, exp))) {
      throw forbidden('Tautan file sudah tidak berlaku.')
    }
  }

  try {
    const body = await readFile(localFilePath(visibility, path))
    const ext = path.split('.').pop() ?? ''
    const type = Object.entries(EXTENSION_BY_TYPE).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream'
    setResponseHeaders(event, {
      'content-type': type,
      'x-content-type-options': 'nosniff',
      'cache-control': visibility === 'private' ? 'private, no-store' : 'public, max-age=3600'
    })
    return body
  } catch {
    throw notFound('File tidak ditemukan.')
  }
})
