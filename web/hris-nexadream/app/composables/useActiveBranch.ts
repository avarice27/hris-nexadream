// Konsol bekerja pada SATU kantor sekaligus. Pilihan disimpan di localStorage dan
// memulihkan diri sendiri bila id tidak lagi milik tenant (dihapus/nonaktif/di luar cakupan).

export interface BranchSummary {
  id: string
  name: string
  code: string | null
  address: string | null
  phone: string | null
  timezone: string
  isActive: boolean
  isPrimary: boolean
  latitude: number | null
  longitude: number | null
  geofenceRadiusMeters: number | null
  createdAt: string
}

interface BranchListResponse {
  items: BranchSummary[]
  usage: { active: number, limit: number }
  geofenceAvailable: boolean
}

const STORAGE_KEY = 'hrisnexadream_active_branch'

export function useActiveBranch() {
  const branches = useState<BranchSummary[]>('branches:items', () => [])
  const usage = useState<{ active: number, limit: number }>('branches:usage', () => ({ active: 0, limit: 1 }))
  const geofenceAvailable = useState<boolean>('branches:geofence', () => false)
  const loaded = useState<boolean>('branches:loaded', () => false)
  const activeBranchId = useState<string | null>('branches:active', () => null)

  const activeBranches = computed(() => branches.value.filter(b => b.isActive))
  const activeBranch = computed(() => activeBranches.value.find(b => b.id === activeBranchId.value) ?? null)

  function heal() {
    const valid = activeBranches.value.some(b => b.id === activeBranchId.value)
    if (!valid) {
      activeBranchId.value = activeBranches.value.find(b => b.isPrimary)?.id ?? activeBranches.value[0]?.id ?? null
    }
    if (import.meta.client) {
      if (activeBranchId.value) localStorage.setItem(STORAGE_KEY, activeBranchId.value)
      else localStorage.removeItem(STORAGE_KEY)
    }
  }

  async function load(force = false) {
    if (loaded.value && !force) return
    const response = await apiFetch<BranchListResponse>('/api/app/branches')
    branches.value = response.items
    usage.value = response.usage
    geofenceAvailable.value = response.geofenceAvailable
    if (import.meta.client && !activeBranchId.value) activeBranchId.value = localStorage.getItem(STORAGE_KEY)
    loaded.value = true
    heal()
  }

  function setActiveBranch(id: string) {
    activeBranchId.value = id
    heal()
  }

  function reset() {
    branches.value = []
    loaded.value = false
    activeBranchId.value = null
  }

  return { branches, activeBranches, activeBranch, activeBranchId, usage, geofenceAvailable, loaded, load, setActiveBranch, reset }
}
