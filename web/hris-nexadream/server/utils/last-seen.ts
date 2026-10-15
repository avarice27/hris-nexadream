import type { AuthAudience } from '~~/generated/prisma/client'

// Menulis lastSeenAt paling banyak sekali per 15 menit per pengguna per instance.
// Di serverless ini hanya mengurangi jumlah tulis, bukan angka eksak.

const INTERVAL_MS = 15 * 60 * 1000
const MAX_ENTRIES = 5_000
const store = globalThis as unknown as { __lastSeen?: Map<string, number> }
const claims = store.__lastSeen ??= new Map<string, number>()

export async function touchLastSeen(audience: AuthAudience, userId: string): Promise<void> {
  const key = `${audience}:${userId}`
  const now = Date.now()
  const previous = claims.get(key)
  if (previous && now - previous < INTERVAL_MS) return
  if (claims.size >= MAX_ENTRIES) claims.clear()
  claims.set(key, now)
  try {
    if (audience === 'platform') {
      await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date(now) } })
    } else {
      await prisma.tenantUser.update({ where: { id: userId }, data: { lastSeenAt: new Date(now) } })
    }
  } catch {
    // Kembalikan klaim agar request berikutnya mencoba lagi; jangan pernah melempar.
    if (previous) claims.set(key, previous)
    else claims.delete(key)
  }
}
