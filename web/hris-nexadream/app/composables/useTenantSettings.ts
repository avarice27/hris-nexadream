import type { LeavePolicyItem, WorkCalendar } from '#shared/utils/identifiers'

export interface TenantSettingsView {
  id: string
  name: string
  slug: string
  legalName: string | null
  industry: string | null
  phone: string | null
  email: string | null
  timezone: string
  logoUrl: string | null
  npwpMasked: string | null
  workCalendar: WorkCalendar | null
  leavePolicy: LeavePolicyItem[] | null
}

/** Satu fetch dipakai bersama oleh halaman-halaman Pengaturan. */
export function useTenantSettings() {
  const settings = useState<TenantSettingsView | null>('tenant-settings', () => null)
  const status = useState<'idle' | 'loading' | 'error' | 'success'>('tenant-settings:status', () => 'idle')
  const errorMessage = useState<string>('tenant-settings:error', () => '')

  async function load(force = false) {
    if (settings.value && !force) return
    status.value = 'loading'
    try {
      settings.value = await apiFetch<TenantSettingsView>('/api/app/settings')
      status.value = 'success'
    } catch (error) {
      errorMessage.value = extractErrorMessage(error)
      status.value = 'error'
    }
  }

  async function save(patch: Record<string, unknown>) {
    settings.value = await apiFetch<TenantSettingsView>('/api/app/settings', { method: 'PATCH', body: patch })
    // Nama/logo/zona waktu tampil di shell: segarkan profil.
    await useTenantAuth().fetchProfile().catch(() => {})
    return settings.value
  }

  return { settings, status, errorMessage, load, save }
}
