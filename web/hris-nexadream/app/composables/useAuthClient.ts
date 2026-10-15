import type { TenantAbility, TenantRoleSlug } from '#shared/utils/tenant-abilities'
import { canTenantRole } from '#shared/utils/tenant-abilities'

// Satu pabrik internal; useTenantAuth() dan usePlatformAuth() adalah pembungkus tipis.
// State memakai useState per audiens sehingga satu instance dipakai semua komponen.

export type Audience = 'tenant' | 'platform'

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
  hasPassword?: boolean
}

export interface TenantSummary {
  id: string
  name: string
  slug: string
  status: string
  logoUrl: string | null
  timezone: string
  onboardingCompletedAt: string | null
  needsBranchSelection: boolean
}

interface ProfileResponse {
  user: AuthUser
  tenant?: TenantSummary
  employeeId?: string | null
  displayTimezone: string
  impersonating: boolean
}

interface SignInResponse {
  token: string
  expiresAt: string
  user: AuthUser
}

export interface AuthClientOptions {
  audience: Audience
  storageKey: string
  loginEndpoint: string
  logoutEndpoint: string
  profileEndpoint: string
  loginRoute: string
  homeRoute: string
  beforeLogout?: () => Promise<void>
}

export function useAuthClient(options: AuthClientOptions) {
  const prefix = `auth:${options.audience}`
  const token = useState<string | null>(`${prefix}:token`, () => null)
  const profile = useState<AuthUser | null>(`${prefix}:profile`, () => null)
  const tenant = useState<TenantSummary | null>(`${prefix}:tenant`, () => null)
  const employeeId = useState<string | null>(`${prefix}:employeeId`, () => null)
  const displayTimezone = useState<string>(`${prefix}:timezone`, () => 'Asia/Jakarta')
  const impersonating = useState<boolean>(`${prefix}:impersonating`, () => false)
  const ready = useState<boolean>(`${prefix}:ready`, () => false)
  const initPromise = useState<Promise<void> | null>(`${prefix}:init`, () => null)

  const isAuthenticated = computed(() => !!token.value && !!profile.value)

  /** State milik sesi sebelumnya (paket, kantor, pengaturan, notifikasi) tidak boleh terbawa ke akun lain. */
  function clearSessionScopedState() {
    const prefixes = options.audience === 'tenant'
      ? ['entitlements:', 'branches:', 'tenant-settings', 'notifications:tenant', 'trial-banner:', 'org:', 'approvals:']
      : ['notifications:platform', 'admin:menus']
    clearNuxtState(key => prefixes.some(prefix => key.startsWith(prefix)))
    // clearNuxtState membuat nilainya undefined; ref yang sudah dipegang komponen ikut undefined
    // dan bisa membuat UI crash. Inisialisasi ulang langsung ke nilai bawaan — useState mengisi
    // kunci yang kosong, dan ref lama melihat nilai baru karena menunjuk properti yang sama.
    if (options.audience === 'tenant') {
      useEntitlements()
      useActiveBranch()
      useTenantSettings()
      useNotifications('tenant')
      useBilling()
      useOrgOptions()
      useState('approvals:count', () => 0)
      useState('trial-banner:dismissed', () => false)
    } else {
      useNotifications('platform')
      useState('admin:menus', () => [])
      useState('admin:menus:loaded', () => false)
    }
  }

  function reset() {
    clearSessionScopedState()
    token.value = null
    profile.value = null
    tenant.value = null
    employeeId.value = null
    impersonating.value = false
    if (import.meta.client) localStorage.removeItem(options.storageKey)
  }

  async function fetchProfile() {
    try {
      const response = await apiFetch<ProfileResponse>(options.profileEndpoint)
      profile.value = response.user
      tenant.value = response.tenant ?? null
      employeeId.value = response.employeeId ?? null
      displayTimezone.value = response.displayTimezone
      impersonating.value = response.impersonating
    } catch (error) {
      reset()
      throw error
    }
  }

  async function init() {
    if (import.meta.server || ready.value) return
    initPromise.value ??= (async () => {
      const stored = localStorage.getItem(options.storageKey)
      if (stored) {
        token.value = stored
        await fetchProfile().catch(() => {})
      }
      ready.value = true
    })()
    await initPromise.value
  }

  async function adoptToken(newToken: string) {
    clearSessionScopedState()
    localStorage.setItem(options.storageKey, newToken)
    token.value = newToken
    await fetchProfile()
    ready.value = true
  }

  async function login(input: { identifier: string, password: string }) {
    const response = await apiFetch<SignInResponse>(options.loginEndpoint, { method: 'POST', body: input })
    await adoptToken(response.token)
    return response
  }

  async function logout(redirect = true) {
    try {
      await options.beforeLogout?.()
      if (token.value) await apiFetch(options.logoutEndpoint, { method: 'POST' })
    } catch {
      // Logout lokal tetap dilanjutkan.
    }
    reset()
    if (redirect) await navigateTo(options.loginRoute)
  }

  function hasPermission(key: string | string[]): boolean {
    const user = profile.value
    if (!user) return false
    if (user.role?.isSuperAdmin) return true
    const keys = Array.isArray(key) ? key : [key]
    return keys.some(k => user.permissions?.includes(k))
  }

  function hasRole(slug: string | string[]): boolean {
    const user = profile.value
    const current = options.audience === 'tenant' ? user?.tenantRole : user?.role?.slug
    if (!current) return false
    return Array.isArray(slug) ? slug.includes(current) : slug === current
  }

  function hasAbility(ability: TenantAbility): boolean {
    return canTenantRole(profile.value?.tenantRole, ability)
  }

  return {
    token: readonly(token),
    profile,
    tenant,
    employeeId,
    displayTimezone,
    impersonating,
    ready,
    isAuthenticated,
    homeRoute: options.homeRoute,
    loginRoute: options.loginRoute,
    init,
    login,
    adoptToken,
    logout,
    fetchProfile,
    reset,
    hasPermission,
    hasRole,
    hasAbility
  }
}
