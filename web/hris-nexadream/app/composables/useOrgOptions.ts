// Pilihan organisasi (kantor, departemen, jabatan, shift) untuk form karyawan. Dimuat sekali per sesi halaman.
interface Option { label: string, value: string }

export function useOrgOptions() {
  const branches = useActiveBranch()
  const departments = useState<Option[]>('org:departments', () => [])
  const positions = useState<Option[]>('org:positions', () => [])
  const shifts = useState<Option[]>('org:shifts', () => [])
  const loaded = useState<boolean>('org:loaded', () => false)

  async function load(force = false) {
    if (loaded.value && !force) return
    const [d, p, s] = await Promise.all([
      apiFetch<{ items: Array<{ id: string, name: string, isActive: boolean }> }>('/api/app/departments'),
      apiFetch<{ items: Array<{ id: string, name: string, isActive: boolean }> }>('/api/app/positions'),
      apiFetch<{ items: Array<{ id: string, name: string, isActive: boolean, startTime: string, endTime: string }> }>('/api/app/shifts').catch(() => ({ items: [] }))
    ])
    departments.value = d.items.filter(x => x.isActive).map(x => ({ label: x.name, value: x.id }))
    positions.value = p.items.filter(x => x.isActive).map(x => ({ label: x.name, value: x.id }))
    shifts.value = s.items.filter(x => x.isActive).map(x => ({ label: `${x.name} (${x.startTime}–${x.endTime})`, value: x.id }))
    await branches.load()
    loaded.value = true
  }

  const branchOptions = computed(() => branches.activeBranches.value.map(b => ({ label: b.name, value: b.id })))
  return { load, departments, positions, shifts, branchOptions }
}
