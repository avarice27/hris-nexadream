import { FEATURE_META, LIMIT_META, UNLIMITED, type FeatureKey, type LimitKey, type PlanFeatures, type PlanLimits } from '#shared/utils/plans'

// Hak paket untuk UI (useState, satu fetch per pemuatan). Server tetap memeriksa ulang setiap request;
// di sini hanya untuk menampilkan gembok, menonaktifkan tombol, dan membuka dialog upgrade.

export interface ClientEntitlements {
  tenantId: string
  planSlug: string
  planName: string
  effectivePlanSlug: string
  status: string
  limits: PlanLimits
  features: PlanFeatures
  trialEndsAt: string | null
  trialDaysRemaining: number | null
  graceEndsAt: string | null
  currentPeriodEnd: string | null
  isTrialing: boolean
  isInGrace: boolean
  usage: Record<LimitKey, number>
}

export interface UpgradeDialogState {
  open: boolean
  message: string
  feature: FeatureKey | null
  limit: LimitKey | null
}

const MUTATION_REFRESH_MS = 600

export function useEntitlements() {
  const data = useState<ClientEntitlements | null>('entitlements:data', () => null)
  const loaded = useState<boolean>('entitlements:loaded', () => false)
  const upgradeDialog = useState<UpgradeDialogState>('entitlements:dialog', () => ({ open: false, message: '', feature: null, limit: null }))

  async function refresh() {
    try {
      data.value = await apiFetch<ClientEntitlements>('/api/app/entitlements')
      loaded.value = true
    } catch {
      // Gagal memuat = tidak ada gembok; server tetap menolak dengan 402 bila perlu.
    }
  }

  async function load() {
    if (!loaded.value) await refresh()
  }

  /** Paket gagal dimuat → anggap tersedia (server tetap menjaga). */
  function can(feature: FeatureKey): boolean {
    return data.value ? data.value.features[feature] : true
  }

  function limit(key: LimitKey): number {
    return data.value?.limits[key] ?? UNLIMITED
  }

  function isUnlimited(key: LimitKey): boolean {
    return limit(key) === UNLIMITED
  }

  function used(key: LimitKey): number {
    return data.value?.usage[key] ?? 0
  }

  function remaining(key: LimitKey): number {
    return isUnlimited(key) ? Number.POSITIVE_INFINITY : Math.max(0, limit(key) - used(key))
  }

  function atLimit(key: LimitKey): boolean {
    return !isUnlimited(key) && used(key) >= limit(key)
  }

  /** Paket sekarang sudah punya semua fitur → tombol upgrade tidak perlu tampil. */
  const hasEverything = computed(() => !!data.value && Object.values(data.value.features).every(Boolean))

  function upgradeRequired(feature: FeatureKey, message?: string) {
    upgradeDialog.value = {
      open: true,
      feature,
      limit: null,
      message: message ?? `Fitur ${FEATURE_META[feature].label} belum tersedia di paket ${data.value?.planName ?? 'Anda'}.`
    }
  }

  function limitReached(key: LimitKey, message?: string) {
    upgradeDialog.value = {
      open: true,
      feature: null,
      limit: key,
      message: message ?? `Batas ${LIMIT_META[key].sentence} di paket ${data.value?.planName ?? 'Anda'} sudah tercapai.`
    }
  }

  /** 402 → buka dialog upgrade dengan pesan server. true bila sudah ditangani. */
  function handlePlanError(caught: unknown): boolean {
    if (extractStatusCode(caught) !== 402) return false
    const details = (caught as { data?: { data?: { feature?: FeatureKey, limit?: LimitKey } } })?.data?.data
    upgradeDialog.value = {
      open: true,
      feature: details?.feature ?? null,
      limit: details?.limit ?? null,
      message: extractErrorMessage(caught)
    }
    void refresh()
    return true
  }

  function closeDialog() {
    upgradeDialog.value = { ...upgradeDialog.value, open: false }
  }

  function reset() {
    data.value = null
    loaded.value = false
  }

  return {
    data, loaded, upgradeDialog, hasEverything,
    load, refresh, reset, can, limit, isUnlimited, used, remaining, atLimit,
    upgradeRequired, limitReached, handlePlanError, closeDialog
  }
}

/** Dipasang sekali oleh shell: segarkan pemakaian setelah penulisan yang mengubah hitungan. */
export function useEntitlementsAutoRefresh() {
  const entitlements = useEntitlements()
  let timer: ReturnType<typeof setTimeout> | undefined
  const relevant = /^\/api\/app\/(branches|team|uploads|settings|onboarding|account|employees)/
  const stop = onApiMutation((url) => {
    if (!relevant.test(url)) return
    clearTimeout(timer)
    timer = setTimeout(() => void entitlements.refresh(), MUTATION_REFRESH_MS)
  })
  onBeforeUnmount(() => {
    stop()
    clearTimeout(timer)
  })
}
