import type { H3Event } from 'h3'

// Endpoint cron = GET publik tanpa auth (Vercel Cron), jadi WAJIB: throttle + langkah idempoten.
// Throttle di memori hanya per instance (best-effort); kebenaran dijamin oleh idempotensi
// tiap langkah dan klaim tahan-lama (claimSettingValue) untuk pekerjaan "sekali sehari".

const THROTTLE_MS = 60_000
const store = globalThis as unknown as { __cronRuns?: Map<string, number> }
const lastRuns = store.__cronRuns ??= new Map<string, number>()

export async function runThrottled<T>(event: H3Event, job: string, fn: () => Promise<T>) {
  const now = Date.now()
  const last = lastRuns.get(job)
  if (last && now - last < THROTTLE_MS) {
    setResponseStatus(event, 429)
    return { job, skipped: true, reason: 'throttled', retryAfterSeconds: Math.ceil((THROTTLE_MS - (now - last)) / 1000) }
  }
  lastRuns.set(job, now)
  const started = Date.now()
  try {
    const result = await fn()
    return { job, ok: true, durationMs: Date.now() - started, result }
  } catch (error) {
    console.error(`[cron:${job}] failed`, error)
    setResponseStatus(event, 500)
    return { job, ok: false, durationMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) }
  }
}
