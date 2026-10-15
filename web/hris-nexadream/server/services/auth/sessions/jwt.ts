import jwt from 'jsonwebtoken'
import type { SessionClaims, SessionDriver } from '../types'

const DEV_FALLBACK_SECRET = 'dev-only-insecure-jwt-secret-change-me'

function secret(): string {
  const value = process.env.JWT_SECRET
  if (value) return value
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required in production.')
  return DEV_FALLBACK_SECRET
}

export function jwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || '7d'
}

export const jwtSessionDriver: SessionDriver = {
  name: 'jwt',

  issue(claims: SessionClaims, options?: { expiresInSeconds?: number }) {
    const payload: Record<string, string> = { sub: claims.sub, aud: claims.aud }
    if (claims.imp) payload.imp = claims.imp
    if (claims.tid) payload.tid = claims.tid
    // `aud` adalah field kita sendiri, bukan registered claim JWT → jangan pakai opsi `audience`.
    const expiresIn = options?.expiresInSeconds ?? (jwtExpiresIn() as jwt.SignOptions['expiresIn'])
    return jwt.sign(payload, secret(), { expiresIn, algorithm: 'HS256' })
  },

  verify(token: string) {
    try {
      const decoded = jwt.verify(token, secret(), { algorithms: ['HS256'] })
      if (typeof decoded !== 'object' || decoded === null) return null
      const { sub, aud, imp, tid } = decoded as Record<string, unknown>
      if (typeof sub !== 'string' || (aud !== 'tenant' && aud !== 'platform')) return null
      return {
        sub,
        aud,
        imp: typeof imp === 'string' ? imp : undefined,
        tid: typeof tid === 'string' ? tid : undefined
      }
    } catch {
      return null
    }
  },

  async revoke() {
    // JWT stateless: klien menghapus token.
  }
}
