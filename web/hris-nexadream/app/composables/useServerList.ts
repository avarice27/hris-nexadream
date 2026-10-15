// Daftar dengan paginasi server: pencarian di-debounce 300 ms (≥ 2 karakter), setiap perubahan
// filter kembali ke halaman 1. Bentuk respons: { items, meta: { total, pageCount }, ...extra }.

export interface ServerListMeta { page: number, limit: number, total: number, pageCount: number }

export function useServerList<T, Extra extends Record<string, unknown> = Record<string, unknown>>(
  endpoint: string,
  options: { limit?: number, filters?: Record<string, Ref<string | undefined>> } = {}
) {
  const ALL = '__all__'
  const items = shallowRef<T[]>([])
  const meta = ref<ServerListMeta>({ page: 1, limit: options.limit ?? 20, total: 0, pageCount: 1 })
  const extra = shallowRef<Partial<Extra>>({})
  const page = ref(1)
  const search = ref('')
  const status = ref<'loading' | 'error' | 'success'>('loading')
  const errorMessage = ref('')

  async function refresh() {
    status.value = items.value.length ? 'success' : 'loading'
    try {
      const query: Record<string, unknown> = { page: page.value, limit: meta.value.limit }
      if (search.value.trim().length >= 2) query.search = search.value.trim()
      for (const [key, value] of Object.entries(options.filters ?? {})) {
        if (value.value && value.value !== ALL) query[key] = value.value
      }
      const response = await apiFetch<{ items: T[], meta: ServerListMeta } & Extra>(endpoint, { query })
      const { items: rows, meta: m, ...rest } = response
      items.value = rows
      meta.value = m
      extra.value = rest as unknown as Partial<Extra>
      status.value = 'success'
    } catch (error) {
      errorMessage.value = extractErrorMessage(error)
      status.value = 'error'
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(search, () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      page.value = 1
      void refresh()
    }, 300)
  })
  watch(() => Object.values(options.filters ?? {}).map(f => f.value), () => {
    page.value = 1
    void refresh()
  })
  watch(page, () => refresh())
  onMounted(refresh)
  onBeforeUnmount(() => clearTimeout(timer))

  return { items, meta, extra, page, search, status, errorMessage, refresh, ALL }
}
