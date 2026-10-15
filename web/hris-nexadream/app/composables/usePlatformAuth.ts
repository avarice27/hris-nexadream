import { PLATFORM_TOKEN_KEY } from '#shared/utils/auth-rules'

export function usePlatformAuth() {
  return useAuthClient({
    audience: 'platform',
    storageKey: PLATFORM_TOKEN_KEY,
    loginEndpoint: '/api/admin/auth/login',
    logoutEndpoint: '/api/admin/auth/logout',
    profileEndpoint: '/api/admin/auth/profile',
    loginRoute: '/admin/auth/login',
    homeRoute: '/admin/dashboard'
  })
}
