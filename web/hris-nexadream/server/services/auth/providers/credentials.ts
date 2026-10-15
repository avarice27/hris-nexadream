import bcrypt from 'bcryptjs'
import { normalizeIndonesianPhone } from '#shared/utils/phone'
import type { AuthIdentity, AuthProvider, Audience } from '../types'

// Satu-satunya file yang mengimpor bcrypt.
const BCRYPT_COST = 10
// Hash dummy agar waktu respons sama saat akun tidak ada (mencegah enumerasi lewat timing).
let dummyHash: string | null = null
function getDummyHash(): string {
  dummyHash ??= bcrypt.hashSync('hrisnexadream-timing-guard', BCRYPT_COST)
  return dummyHash
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

const INVALID_CREDENTIALS = 'Email atau kata sandi salah.'

export const credentialsProvider: AuthProvider = {
  name: 'credentials',
  supports: ['tenant', 'platform'],

  async authenticate(input: Record<string, unknown>, audience: Audience): Promise<AuthIdentity> {
    const identifier = typeof input.identifier === 'string' ? input.identifier.trim() : ''
    const password = typeof input.password === 'string' ? input.password : ''
    if (!identifier || !password) throw unauthenticated(INVALID_CREDENTIALS)

    const select = { id: true, passwordHash: true, isActive: true } as const
    const account = audience === 'platform'
      ? await prisma.user.findUnique({ where: { email: identifier.toLowerCase() }, select })
      : identifier.includes('@')
        ? await prisma.tenantUser.findUnique({ where: { email: identifier.toLowerCase() }, select })
        : await prisma.tenantUser.findUnique({ where: { phone: normalizeIndonesianPhone(identifier) }, select })

    // Akun tidak ada, nonaktif, tanpa kata sandi (OAuth saja), atau sandi salah → 401 yang SAMA.
    const valid = await verifyPassword(password, account?.passwordHash || getDummyHash())
    if (!account || !account.isActive || !account.passwordHash || !valid) {
      throw unauthenticated(INVALID_CREDENTIALS)
    }
    return { userId: account.id, audience }
  }
}
