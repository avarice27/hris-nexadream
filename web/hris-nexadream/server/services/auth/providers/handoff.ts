import type { AuthProvider } from '../types'

// Kode sekali pakai dari redirect OAuth → sesi. Token sesi tidak pernah lewat URL (03 §5).
export const HANDOFF_TTL_SECONDS = 120

export const handoffProvider: AuthProvider = {
  name: 'handoff',
  supports: ['tenant'],

  async authenticate(input) {
    const code = typeof input.code === 'string' ? input.code : ''
    const invalid = () => unauthenticated('Tautan masuk sudah kedaluwarsa. Silakan masuk lagi.')
    if (code.length < 20) throw invalid()
    const tokenHash = sha256(code)
    const now = new Date()
    // Klaim atomik: hanya satu permintaan yang bisa memakai kode ini.
    const claimed = await prisma.authHandoff.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    })
    if (claimed.count !== 1) throw invalid()
    const handoff = await prisma.authHandoff.findUnique({ where: { tokenHash }, select: { tenantUserId: true, isNew: true } })
    if (!handoff) throw invalid()
    return { userId: handoff.tenantUserId, audience: 'tenant', isNew: handoff.isNew }
  }
}
