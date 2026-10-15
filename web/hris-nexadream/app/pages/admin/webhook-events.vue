<script setup lang="ts">
import { formatDateTimeId } from '#shared/utils/format'
import { providerLabel } from '#shared/utils/payments'

// Log callback gateway: apa kata gateway di samping apa yang kita lakukan, plus replay.
definePageMeta({ layout: 'admin' })
useHead({ title: 'Payment callback' })

interface WebhookEventRow {
  id: string
  provider: string
  orderId: string | null
  gatewayStatus: string | null
  processedAt: string | null
  error: string | null
  replayCount: number
  createdAt: string
  payload: unknown
}

const auth = usePlatformAuth()
const toast = useToast()
const canWrite = computed(() => auth.hasPermission('payments.write'))
const ALL = '__all__'
const search = ref('')
const state = ref(ALL)
const page = ref(1)
const limit = 20
const data = ref<{ items: WebhookEventRow[], meta: { total: number, pageCount: number } } | null>(null)
const errorMessage = ref('')
const replaying = ref<string | null>(null)
const expanded = ref<string | null>(null)

async function load() {
  try {
    data.value = await apiFetch('/api/admin/webhook-events', {
      query: { page: page.value, limit, search: search.value.length >= 2 ? search.value : undefined, state: state.value === ALL ? undefined : state.value }
    })
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})
watch(state, () => {
  page.value = 1
  void load()
})
watch(page, load)

const stateItems = [
  { label: 'Semua', value: ALL },
  { label: 'Diproses', value: 'processed' },
  { label: 'Ada galat', value: 'error' },
  { label: 'Belum diproses', value: 'pending' }
]

function outcome(row: WebhookEventRow): { label: string, color: 'success' | 'error' | 'warning' | 'neutral' } {
  if (row.error === 'unknown order') return { label: 'Bukan pesanan kita', color: 'neutral' }
  if (row.error) return { label: 'Galat', color: 'error' }
  if (row.processedAt) return { label: 'Diproses', color: 'success' }
  return { label: 'Belum diproses', color: 'warning' }
}

async function replay(row: WebhookEventRow) {
  replaying.value = row.id
  try {
    const result = await apiFetch<{ applied: boolean, error: string | null }>(`/api/admin/webhook-events/${row.id}/replay`, { method: 'POST' })
    toast.add({
      title: result.error && result.error !== 'unknown order' ? `Replay gagal: ${result.error}` : (result.applied ? 'Replay diterapkan' : 'Replay: tidak ada perubahan'),
      color: result.error && result.error !== 'unknown order' ? 'error' : 'success'
    })
    await load()
  } catch (error) {
    toast.add({ title: extractErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    replaying.value = null
  }
}
</script>

<template>
  <PagePanel title="Payment callback">
    <div class="space-y-4">
      <div class="flex flex-wrap gap-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Cari nomor pesanan gateway…"
          class="w-full sm:w-80"
          aria-label="Cari callback"
        />
        <USelect
          v-model="state"
          :items="stateItems"
          class="w-48"
          aria-label="Filter status"
        />
      </div>
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
      />
      <USkeleton
        v-else-if="!data"
        class="h-80 w-full"
      />
      <p
        v-else-if="!data.items.length"
        class="py-12 text-center text-sm text-muted"
      >
        Belum ada callback.
      </p>
      <UCard
        v-else
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <ul class="divide-y divide-default">
          <li
            v-for="row in data.items"
            :key="row.id"
            class="px-4 py-3 text-sm"
          >
            <div class="flex flex-wrap items-center gap-3">
              <div class="min-w-0 flex-1">
                <p class="font-mono text-xs">
                  {{ row.orderId ?? '—' }}
                </p>
                <p class="text-xs text-muted">
                  {{ providerLabel(row.provider) }} · gateway: <strong>{{ row.gatewayStatus ?? '—' }}</strong> · {{ formatDateTimeId(row.createdAt, auth.displayTimezone.value) }}
                  <span v-if="row.replayCount"> · replay {{ row.replayCount }}×</span>
                </p>
                <p
                  v-if="row.error && row.error !== 'unknown order'"
                  class="text-xs text-error"
                >
                  {{ row.error }}
                </p>
              </div>
              <UBadge
                :label="outcome(row).label"
                :color="outcome(row).color"
                variant="subtle"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                :label="expanded === row.id ? 'Tutup' : 'Payload'"
                @click="expanded = expanded === row.id ? null : row.id"
              />
              <UButton
                v-if="canWrite"
                size="xs"
                variant="outline"
                label="Replay"
                icon="i-lucide-rotate-ccw"
                :loading="replaying === row.id"
                @click="replay(row)"
              />
            </div>
            <pre
              v-if="expanded === row.id"
              class="mt-2 max-h-64 overflow-auto rounded bg-elevated p-3 text-xs"
            >{{ JSON.stringify(row.payload, null, 2) }}</pre>
          </li>
        </ul>
      </UCard>
      <div
        v-if="data && data.meta.pageCount > 1"
        class="flex justify-center"
      >
        <UPagination
          v-model:page="page"
          :total="data.meta.total"
          :items-per-page="limit"
        />
      </div>
    </div>
  </PagePanel>
</template>
