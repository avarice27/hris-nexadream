import { ConfirmDialog } from '#components'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  color?: 'primary' | 'error' | 'warning'
}

/** confirm({ title, description, confirmLabel, color }) → Promise<boolean>. */
export function useConfirmDialog() {
  const overlay = useOverlay()
  const modal = overlay.create(ConfirmDialog)

  async function confirm(options: ConfirmOptions): Promise<boolean> {
    const result = await modal.open(options)
    return result === true
  }

  return { confirm }
}
