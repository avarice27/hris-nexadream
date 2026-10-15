import type { TenantAbility, TenantRoleSlug } from '#shared/utils/tenant-abilities'

export type Audience = 'tenant' | 'platform'

export interface AuthIdentity {
  userId: string
  audience: Audience
  isNew?: boolean
}

export interface AuthProvider {
  readonly name: string
  readonly supports: Audience[]
  /** Membuktikan identitas atau melempar 401. Tidak pernah mengembalikan token. */
  authenticate(input: Record<string, unknown>, audience: Audience): Promise<AuthIdentity>
}

export interface SessionClaims {
  /** id pengguna */
  sub: string
  aud: Audience
  /** id staf platform saat impersonasi */
  imp?: string
  /** tenant yang disematkan ke token tenant */
  tid?: string
}

export interface SessionDriver {
  readonly name: string
  issue(claims: SessionClaims, options?: { expiresInSeconds?: number }): Promise<string> | string
  verify(token: string): Promise<SessionClaims | null> | (SessionClaims | null)
  /** no-op untuk JWT stateless */
  revoke(token: string): Promise<void>
}

export interface AuthUser {
  id: string
  name: string
  email: string
  phone: string | null
  avatarUrl: string | null
  audience: Audience
  role?: { id: string, slug: string, name: string, isSuperAdmin: boolean }
  permissions?: string[]
  tenantRole?: TenantRoleSlug
  abilities?: TenantAbility[]
  /** false = akun hanya OAuth → tawarkan "buat kata sandi" */
  hasPassword?: boolean
}

export interface SignInResult {
  token: string
  expiresAt: string
  user: AuthUser
  tenantId?: string
  isNew?: boolean
}
