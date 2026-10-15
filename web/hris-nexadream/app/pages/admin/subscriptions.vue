<script setup lang="ts">
import { formatDateId } from '#shared/utils/format'
import { BILLING_PERIOD_LABELS } from '#shared/utils/payments'
import { SUBSCRIPTION_STATUS_META, statusMeta } from '#shared/utils/status'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Langganan' })

interface AdminSubscription {
  id: string
  status: string
  period: 'monthly' | 'yearly'
  plan: { slug: string, name: string }
  tenant: { id: string, name: string, status: string }
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  graceEndsAt: string | null
}

const auth = usePlatformAuth()
const ALL = '__all__'
const search = ref('')
const statusFilter = ref(ALL)
const page = ref(1)
const limit = 20
const data = ref<{ items: AdminSubscription[], meta: { total: number, pageCount: number } } | null>(null)
const errorMessage = ref('')

async function load() {
  try {
    data.value = await apiFetch('/api/admin/subscriptions', {
      query: { page: page.value, limit, search: search.value.length >= 2 ? search.value : undefined, status: statusFilter.value === ALL ? undefined : statusFilter.value }
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
watch(statusFilter, () => {
  page.value = 1
  void load()
})
watch(page, load)

const statusItems = [{ label: 'Semua status', value: ALL }, ...Object.keys(SUBSCRIPTION_STATUS_META).map(s => ({ label: SUBSCRIPTION_STATUS_META[s]!.label, value: s }))]

function dateNote(s: AdminSubscription) {
  const tz = auth.displayTimezone.value
  if (s.status === 'trialing') return `Uji coba sampai ${formatDateId(s.trialEndsAt, tz)}`
  if (s.status === 'past_due') return `Tenggang sampai ${formatDateId(s.graceEndsAt, tz)}`
  if (s.currentPeriodEnd) return `Aktif sampai ${formatDateId(s.currentPeriodEnd, tz)}`
  return '—'
}
</script>

<template>
  <PagePanel title="Langganan">
    <div class="space-y-4">
      <div class="flex flex-wrap gap-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Cari perusahaan…"
          class="w-full sm:w-72"
          aria-label="Cari langganan"
        />
        <USelect
          v-model="statusFilter"
          :items="statusItems"
          class="w-56"
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
        Tidak ada langganan.
      </p>
      <UCard
        v-else
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <ul class="divide-y divide-default">
          <li
            v-for="s in data.items"
            :key="s.id"
            class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
          >
            <div class="min-w-0 flex-1">
              <p class="font-medium">
                {{ s.tenant.name }}
              </p>
              <p class="text-xs text-muted">
                {{ s.plan.name }} · {{ BILLING_PERIOD_LABELS[s.period] }} · {{ dateNote(s) }}
              </p>
            </div>
            <UBadge
              v-if="s.tenant.status !== 'active'"
              :label="s.tenant.status === 'suspended' ? 'Perusahaan ditangguhkan' : 'Perusahaan dihapus'"
              color="error"
              variant="subtle"
            />
            <UBadge
              :label="statusMeta(SUBSCRIPTION_STATUS_META, s.status).label"
              :color="statusMeta(SUBSCRIPTION_STATUS_META, s.status).color"
              variant="subtle"
            />
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
