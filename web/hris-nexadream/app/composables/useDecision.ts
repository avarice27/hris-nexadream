import { DecisionDialog } from '#components'

// Setujui/tolak pengajuan lewat dialog bersama; mengembalikan true bila keputusan tersimpan.
export function useDecision() {
  const overlay = useOverlay()
  const modal = overlay.create(DecisionDialog)
  const toast = useApiToast()

  async function decide(endpoint: string, decision: 'approved' | 'rejected', options: { title: string, description?: string, maxAmount?: number | null }): Promise<boolean> {
    const result = await modal.open({ ...options, decision })
    if (!result) return false
    try {
      const res = await apiFetch<{ status: string }>(endpoint, { method: 'POST', body: result })
      toast.success(decision === 'rejected' ? 'Pengajuan ditolak' : res.status === 'pending' ? 'Disetujui — diteruskan ke penyetuju berikutnya' : 'Pengajuan disetujui')
      return true
    } catch (error) {
      toast.error(error)
      return false
    }
  }

  return { decide }
}
