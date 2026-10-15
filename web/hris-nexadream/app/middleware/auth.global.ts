import { isEssAllowedPath } from '#shared/utils/menus'

// Penjaga batas rute (client saja — kedua konsol adalah SPA).
// Server tetap memeriksa ulang setiap request; ini hanya kenyamanan.
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const path = to.path
  const isTenant = path === '/app' || path.startsWith('/app/')
  const isPlatform = path === '/admin' || path.startsWith('/admin/')
  if (!isTenant && !isPlatform) return
  const isAuthRoute = path.startsWith('/app/auth') || path.startsWith('/admin/auth')

  if (isTenant) {
    const auth = useTenantAuth()
    await auth.init()
    if (isAuthRoute) {
      // accept-invite boleh dibuka saat sudah masuk (untuk keanggotaan lain).
      if (auth.isAuthenticated.value && path !== '/app/auth/accept-invite') return navigateTo(auth.landingRoute.value)
      return
    }
    if (!auth.isAuthenticated.value) {
      return navigateTo({ path: '/app/auth/login', query: path === '/app' ? undefined : { redirect: to.fullPath } })
    }
    if (path === '/app') return navigateTo(auth.landingRoute.value)
    const onboarded = !!auth.tenant.value?.onboardingCompletedAt
    if (auth.hasRole('owner')) {
      if (!onboarded && path !== '/app/onboarding') return navigateTo('/app/onboarding')
      if (onboarded && path === '/app/onboarding') return navigateTo('/app/dashboard')
    }
    if (auth.hasRole('employee') && !isEssAllowedPath(path)) return navigateTo('/app/me')
    return
  }

  const auth = usePlatformAuth()
  await auth.init()
  if (isAuthRoute) {
    if (auth.isAuthenticated.value && path !== '/admin/auth/accept-invite') return navigateTo('/admin/dashboard')
    return
  }
  if (!auth.isAuthenticated.value) {
    return navigateTo({ path: '/admin/auth/login', query: path === '/admin' ? undefined : { redirect: to.fullPath } })
  }
  if (path === '/admin') return navigateTo('/admin/dashboard')
})
