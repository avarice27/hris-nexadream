import { TENANT_TOKEN_KEY } from '#shared/utils/auth-rules'

export function useTenantAuth() {
  const auth = useAuthClient({
    audience: 'tenant',
    storageKey: TENANT_TOKEN_KEY,
    loginEndpoint: '/api/app/auth/login',
    logoutEndpoint: '/api/app/auth/logout',
    profileEndpoint: '/api/app/auth/profile',
    loginRoute: '/app/auth/login',
    homeRoute: '/app/dashboard'
  })

  /** Beranda sesuai peran: karyawan ke ESS (/app/me), lainnya ke dashboard. */
  const landingRoute = computed(() => auth.hasRole('employee') ? '/app/me' : '/app/dashboard')

  return { ...auth, landingRoute }
}
