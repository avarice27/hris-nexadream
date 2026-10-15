import type { EventHandlerRequest, H3Event } from 'h3'
import { createHash } from 'node:crypto'

// /api/v1 — kontrak publik yang dibekukan (12-api-conventions.md).
// Satu pembungkus handler melakukan: gerbang versi mobile, API key / bearer, cek JSON, amplop
// { data } / { data, meta } / { error }. Handler di dalamnya tetap tipis di atas util yang sama
// dengan /api/app, jadi konsol web dan integrator tidak pernah berbeda logika.

export const API_ERROR_CODES = {
  400: 'VALIDATION_FAILED', 401: 'UNAUTHENTICATED', 402: 'PLAN_REQUIRED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
  409: 'CONFLICT', 415: 'VALIDATION_FAILED', 422: 'VALIDATION_FAILED', 426: 'UPGRADE_REQUIRED', 429: 'RATE_LIMITED'
} as const

export interface ErrorEnvelope { error: { code: string, message: string, status: number, details?: Record<string, unknown> } }

export function ok<T>(data: T) {
  return { data }
}

export function paginated<T>(items: T[], meta: { page: number, limit: number, total: number, pageCount: number }) {
  return { data: items, meta }
}

const GENERIC_ERROR = 'Terjadi kesalahan pada server. Silakan coba lagi.'

export function toErrorEnvelope(status: number, message: string | undefined, data: unknown): ErrorEnvelope {
  const details = (data && typeof data === 'object' ? { ...(data as Record<string, unknown>) } : {}) as Record<string, unknown>
  const code = typeof details.code === 'string' ? details.code : (API_ERROR_CODES[status as keyof typeof API_ERROR_CODES] ?? 'SERVER_ERROR')
  delete details.code
  // Kode internal yang bukan bagian kontrak publik dipetakan ke kode publik.
  const publicCode = code === 'UNSUPPORTED_MEDIA_TYPE' ? 'VALIDATION_FAILED' : code === 'INTERNAL' ? 'SERVER_ERROR' : code
  return { error: { code: publicCode, message: message || GENERIC_ERROR, status, ...(Object.keys(details).length ? { details } : {}) } }
}

/** ETag lemah untuk bacaan bergaya katalog. true = 304 (handler mengembalikan null). */
export function handleETag(event: H3Event, payload: unknown): boolean {
  const etag = `W/"${createHash('sha1').update(JSON.stringify(payload)).digest('base64url')}"`
  setResponseHeader(event, 'ETag', etag)
  setResponseHeader(event, 'Cache-Control', 'private, max-age=0, must-revalidate')
  if (getRequestHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return true
  }
  return false
}

// --- Gerbang versi aplikasi mobile ------------------------------------------

export const CLIENT_HEADER = 'x-hrisnexadream-client'

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(n => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

async function assertClientVersion(event: H3Event) {
  const header = getRequestHeader(event, CLIENT_HEADER)
  if (!header) return // integrator tanpa header tidak pernah digerbang
  const version = header.match(/\/(\d+\.\d+\.\d+)/)?.[1]
  if (!version) return
  const minimum = await getSetting('app.minimumMobileVersion')
  if (compareSemver(version, minimum) < 0) {
    throw createError({ statusCode: 426, statusMessage: 'Versi aplikasi Anda sudah tidak didukung. Perbarui aplikasi untuk melanjutkan.', data: { code: 'UPGRADE_REQUIRED', minimumVersion: minimum, currentVersion: version } })
  }
}

// --- Pembungkus handler -----------------------------------------------------

interface V1Options {
  /** Lewati gerbang versi (settings/public, openapi). */
  skipVersionGate?: boolean
  /** Endpoint yang boleh dipanggil dengan X-Api-Key (integrator). */
  apiKey?: boolean
}

function isEnveloped(value: unknown): boolean {
  return !!value && typeof value === 'object' && ('data' in (value as object) || 'error' in (value as object))
}

/** Daftar util `{ items, meta, ...extra }` → `{ data, meta }` (extra diabaikan di kontrak publik). */
function envelope(value: unknown) {
  if (value === null || value === undefined) return value
  if (isEnveloped(value)) return value
  const v = value as { items?: unknown[], meta?: { page: number, limit: number, total: number, pageCount: number } }
  if (Array.isArray(v.items) && v.meta) return paginated(v.items, v.meta)
  // Koleksi kecil tanpa paginasi ({ items }) → { data: [...] }.
  if (Array.isArray(v.items) && Object.keys(v).every(k => k === 'items' || typeof (v as Record<string, unknown>)[k] === 'boolean')) return ok(v.items)
  return ok(value)
}

export function defineApiV1Handler<T>(handler: (event: H3Event<EventHandlerRequest>) => Promise<T> | T, options: V1Options = {}) {
  return defineEventHandler(async (event) => {
    try {
      setResponseHeader(event, 'x-content-type-options', 'nosniff')
      if (!options.skipVersionGate) await assertClientVersion(event)
      assertJsonRequest(event)
      if (getRequestHeader(event, 'x-api-key')) {
        if (!options.apiKey) throw httpError(401, 'UNAUTHENTICATED', 'Endpoint ini tidak menerima API key. Gunakan token login.')
        await requireApiKey(event)
      }
      const result = await handler(event)
      if (getResponseStatus(event) === 304) return null
      return envelope(result)
    } catch (error) {
      const e = error as { statusCode?: number, statusMessage?: string, data?: unknown, unhandled?: boolean, fatal?: boolean }
      const status = e.statusCode && e.statusCode >= 400 ? e.statusCode : 500
      // Pesan internal (bug, error DB) tidak pernah bocor; pesan 4xx ditulis untuk pengguna.
      const expose = status < 500 && !e.unhandled && !e.fatal
      if (!expose) console.error('[api/v1]', event.path, error)
      setResponseStatus(event, status)
      return toErrorEnvelope(status, expose ? e.statusMessage : undefined, expose ? e.data : undefined)
    }
  })
}

// --- Bacaan publik khusus v1 --------------------------------------------------

export async function publicV1Settings() {
  return {
    appName: await getSetting('company.name'),
    minimumMobileVersion: await getSetting('app.minimumMobileVersion'),
    registrationOpen: await getBooleanSetting('app.registrationOpen'),
    supportEmail: await getSetting('company.email')
  }
}

export async function publicV1Plans() {
  const plans = await prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: [{ order: 'asc' }, { priceMonthly: 'asc' }] })
  return plans.map((p) => {
    const v = toPlanView(p)
    return { slug: v.slug, name: v.name, description: v.description, priceMonthly: v.priceMonthly, priceYearly: v.priceYearly, currency: v.currency, trialDays: v.trialDays, limits: v.limits, features: v.features }
  })
}
