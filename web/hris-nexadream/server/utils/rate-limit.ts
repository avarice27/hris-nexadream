import type { H3Event } from 'h3'

// Fixed-window di memori: PER INSTANCE Vercel dan best-effort (CLAUDE.md).
// Cukup sebagai gesekan anti-abuse, bukan jaminan. Antarmuka berbentuk "store"
// agar mudah dipindah ke Redis/DB sebelum peluncuran.

interface Bucket { count: number, resetAt: number }

const MAX_BUCKETS = 10_000
const globalStore = globalThis as unknown as { __rateLimitBuckets?: Map<string, Bucket> }
const buckets = globalStore.__rateLimitBuckets ??= new Map<string, Bucket>()

export const LOGIN_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 }
export const LOGIN_IP_RATE_LIMIT = { limit: 20, windowMs: 15 * 60 * 1000 }

function prune(now: number) {
  if (buckets.size < MAX_BUCKETS) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
  // Masih penuh: buang entri tertua (urutan sisipan Map).
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value
    if (oldest === undefined) break
    buckets.delete(oldest)
  }
}

export function assertRateLimit(scope: string, identifier: string, limit: number, windowMs: number) {
  const now = Date.now()
  const key = `${scope}:${identifier}`
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    prune(now)
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  bucket.count += 1
  if (bucket.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    const minutes = Math.ceil(retryAfterSeconds / 60)
    throw httpError(429, 'RATE_LIMITED', `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`, { retryAfterSeconds })
  }
}

export function resetRateLimit(key: string) {
  buckets.delete(key)
}

export function clientIp(event: H3Event): string {
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return getRequestHeader(event, 'x-real-ip') || event.node.req.socket?.remoteAddress || 'unknown'
}

// ---------------------------------------------------------------------------
// Rate limit bersama lintas instance (tabel rate_limit_buckets, jendela tetap, satu statement atomik).
// Kunci disimpan sebagai hash — identifier/IP tidak pernah tersimpan. Bila DB gagal, jatuh ke
// rate limit memori agar login tidak ikut gagal karena penyimpanan rate limit.
// ---------------------------------------------------------------------------

export async function assertSharedRateLimit(scope: string, identifier: string, limit: number, windowMs: number) {
  const key = sha256(`${scope}:${identifier}`)
  const now = new Date()
  const resetAt = new Date(now.getTime() + windowMs)
  let row: { count: number, resetAt: Date } | undefined
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number, resetAt: Date }>>`
      INSERT INTO "rate_limit_buckets" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "rate_limit_buckets"."resetAt" <= ${now} THEN 1 ELSE "rate_limit_buckets"."count" + 1 END,
        "resetAt" = CASE WHEN "rate_limit_buckets"."resetAt" <= ${now} THEN ${resetAt} ELSE "rate_limit_buckets"."resetAt" END
      RETURNING "count", "resetAt"`
    row = rows[0]
  } catch (error) {
    console.error('[rate-limit] shared store unavailable, using memory', error)
    assertRateLimit(scope, identifier, limit, windowMs)
    return
  }
  if (row && Number(row.count) > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((new Date(row.resetAt).getTime() - now.getTime()) / 1000))
    throw httpError(429, 'RATE_LIMITED', `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(retryAfterSeconds / 60)} menit.`, { retryAfterSeconds })
  }
}

export async function resetSharedRateLimit(scope: string, identifier: string) {
  await prisma.rateLimitBucket.deleteMany({ where: { key: sha256(`${scope}:${identifier}`) } }).catch(() => {})
}

/** Cron: buang bucket kedaluwarsa. */
export async function pruneRateLimitBuckets(now = new Date()) {
  const { count } = await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: now } } })
  return { pruned: count }
}
