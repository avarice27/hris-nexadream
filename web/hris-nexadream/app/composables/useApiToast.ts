// Toast seragam untuk hasil API. 402 (batas/fitur paket) tidak menjadi toast: ia membuka
// <UpgradeDialog> lewat useEntitlements().handlePlanError.

export function useApiToast() {
  const toast = useToast()
  const entitlements = useEntitlements()
  const router = useRouter()

  function success(title: string, description?: string) {
    toast.add({ title, description, color: 'success', icon: 'i-lucide-check' })
  }

  function error(caught: unknown, fallback?: string) {
    // Di layanan mandiri (/app/me) tidak ada dialog upgrade — karyawan cukup melihat pesannya.
    if (!router.currentRoute.value.path.startsWith('/app/me') && entitlements.handlePlanError(caught)) return
    toast.add({ title: extractErrorMessage(caught, fallback), color: 'error', icon: 'i-lucide-circle-alert' })
  }

  return { success, error }
}
