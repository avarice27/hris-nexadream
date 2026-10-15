import { PLATFORM_RETURN_TOKEN_KEY, PLATFORM_TOKEN_KEY, TENANT_TOKEN_KEY } from '#shared/utils/auth-rules'

// SATU-SATUNYA kode yang menulis token impersonasi. Halaman tidak pernah menyentuh kunci ini langsung.
// - Impersonasi perusahaan menulis kunci TENANT → sesi staf tetap utuh; konsol /app dibuka di tab baru.
// - Impersonasi staf menimpa kunci PLATFORM → token asli disimpan dulu di kunci "return".

export function useAdminImpersonation() {
  const platform = usePlatformAuth()

  async function openTenantSession(token: string) {
    // Bersihkan state sesi perusahaan sebelumnya di tab ini, lalu buka konsol di tab baru.
    localStorage.setItem(TENANT_TOKEN_KEY, token)
    const tab = window.open('/app/dashboard', '_blank')
    if (!tab) window.location.href = '/app/dashboard'
  }

  async function impersonateTenant(tenantId: string, reason: string) {
    const result = await apiFetch<{ token: string }>(`/api/admin/tenants/${tenantId}/impersonate`, { method: 'POST', body: { reason } })
    await openTenantSession(result.token)
  }

  async function impersonateTenantUser(tenantUserId: string, reason: string, tenantId?: string) {
    const result = await apiFetch<{ token: string }>(`/api/admin/tenant-users/${tenantUserId}/impersonate`, { method: 'POST', body: { reason, tenantId } })
    await openTenantSession(result.token)
  }

  async function impersonateStaff(userId: string, reason: string) {
    const original = localStorage.getItem(PLATFORM_TOKEN_KEY)
    const result = await apiFetch<{ token: string }>(`/api/admin/users/${userId}/impersonate`, { method: 'POST', body: { reason } })
    if (original) localStorage.setItem(PLATFORM_RETURN_TOKEN_KEY, original)
    await platform.adoptToken(result.token)
    await navigateTo('/admin/dashboard')
  }

  async function stopStaffImpersonation() {
    try {
      await apiFetch('/api/admin/auth/stop-impersonation', { method: 'POST' })
    } catch {
      // Token mungkin sudah kedaluwarsa — tetap kembalikan sesi asli.
    }
    const original = localStorage.getItem(PLATFORM_RETURN_TOKEN_KEY)
    localStorage.removeItem(PLATFORM_RETURN_TOKEN_KEY)
    if (original) {
      try {
        await platform.adoptToken(original)
        await navigateTo('/admin/users')
        return
      } catch {
        // Sesi asli juga sudah habis → masuk ulang.
      }
    }
    await platform.logout()
  }

  return { impersonateTenant, impersonateTenantUser, impersonateStaff, stopStaffImpersonation }
}
