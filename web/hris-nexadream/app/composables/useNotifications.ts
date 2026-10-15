// Satu state per audiens, dipakai bersama oleh bel dan halaman notifikasi (satu fetch, satu badge).

export interface NotificationItem {
  id: string
  title: string
  body: string
  actionUrl: string | null
  icon: string | null
  level: 'info' | 'success' | 'warning' | 'error'
  readAt: string | null
  createdAt: string
}

export interface NotificationListResponse {
  items: NotificationItem[]
  meta: { page: number, limit: number, total: number, pageCount: number }
  unreadCount: number
}

type Audience = 'tenant' | 'platform'

const POLL_MS = 60_000

export function useNotifications(audience: Audience) {
  const base = audience === 'tenant' ? '/api/app/notifications' : '/api/admin/notifications'
  const prefix = `notifications:${audience}`
  const items = useState<NotificationItem[]>(`${prefix}:items`, () => [])
  const unreadCount = useState<number>(`${prefix}:unread`, () => 0)
  const loaded = useState<boolean>(`${prefix}:loaded`, () => false)
  const loading = useState<boolean>(`${prefix}:loading`, () => false)

  async function refresh() {
    if (loading.value) return
    loading.value = true
    try {
      const response = await apiFetch<NotificationListResponse>(base, { query: { limit: 8 } })
      items.value = response.items
      unreadCount.value = response.unreadCount
      loaded.value = true
    } catch {
      // Bel tidak boleh mengganggu halaman; coba lagi pada putaran berikutnya.
    } finally {
      loading.value = false
    }
  }

  async function markRead(id: string) {
    const item = items.value.find(n => n.id === id)
    if (item && !item.readAt) {
      item.readAt = new Date().toISOString()
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
    await apiFetch(`${base}/${id}/read`, { method: 'POST' }).catch(() => refresh())
  }

  async function markAllRead() {
    const now = new Date().toISOString()
    items.value = items.value.map(n => n.readAt ? n : { ...n, readAt: now })
    unreadCount.value = 0
    await apiFetch(`${base}/read-all`, { method: 'POST' }).catch(() => refresh())
  }

  /** Muat sekali + perbarui berkala selama tab terlihat. Panggil dari komponen bel. */
  function startPolling() {
    if (import.meta.server) return
    if (!loaded.value) void refresh()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    onBeforeUnmount(() => clearInterval(timer))
  }

  return { items, unreadCount, loaded, loading, refresh, markRead, markAllRead, startPolling, base }
}
