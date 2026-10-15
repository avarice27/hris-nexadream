<script setup lang="ts">
import { formatDateTimeId, formatIDR } from '#shared/utils/format'
import { BILLING_PERIOD_LABELS, PAYMENT_STATUSES, providerLabel } from '#shared/utils/payments'
import { PAYMENT_STATUS_META, statusMeta } from '#shared/utils/status'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Pembayaran' })

interface AdminPayment {
  id: string
  orderId: string
  gatewayOrderId: string | null
  provider: string
  amount: number
  status: string
  rawStatus: string | null
  paymentType: string | null
  period: 'monthly' | 'yearly'
  planSlug: string | null
  paidAt: string | null
  createdAt: string
  tenant: { id: string, name: string }
}

const auth = usePlatformAuth()
const ALL = '__all__'
const search = ref('')
const statusFilter = ref(ALL)
const page = ref(1)
const limit = 20
const data = ref<{ items: AdminPayment[], meta: { total: number, pageCount: number } } | null>(null)
const errorMessage = ref('')

async function load() {
  try {
    data.value = await apiFetch('/api/admin/payments', {
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

const statusItems = [{ label: 'Semua status', value: ALL }, ...PAYMENT_STATUSES.map(s => ({ label: statusMeta(PAYMENT_STATUS_META, s).label, value: s }))]
</script>

<template>
  <PagePanel title="Pembayaran">
    <div class="space-y-4">
      <div class="flex flex-wrap gap-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Cari nomor pesanan atau perusahaan…"
          class="w-full sm:w-80"
          aria-label="Cari pembayaran"
        />
        <USelect
          v-model="statusFilter"
          :items="statusItems"
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
        Tidak ada pembayaran.
      </p>
      <div
        v-else
        class="overflow-x-auto rounded-md border border-default"
      >
        <table class="w-full text-sm">
          <thead class="bg-elevated/50 text-left text-xs text-muted">
            <tr>
              <th class="px-3 py-2 font-medium">
                Pesanan
              </th>
              <th class="px-3 py-2 font-medium">
                Perusahaan
              </th>
              <th class="px-3 py-2 font-medium">
                Paket
              </th>
              <th class="px-3 py-2 text-right font-medium">
                Jumlah
              </th>
              <th class="px-3 py-2 font-medium">
                Status
              </th>
              <th class="px-3 py-2 font-medium">
                Waktu
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr
              v-for="p in data.items"
              :key="p.id"
            >
              <td class="px-3 py-2">
                <p class="font-mono text-xs">
                  {{ p.orderId }}
                </p>
                <p class="font-mono text-xs text-dimmed">
                  {{ p.gatewayOrderId }} · {{ providerLabel(p.provider) }}
                </p>
              </td>
              <td class="px-3 py-2">
                {{ p.tenant.name }}
              </td>
              <td class="px-3 py-2">
                {{ p.planSlug }} · {{ BILLING_PERIOD_LABELS[p.period] }}
              </td>
              <td class="tabular px-3 py-2 text-right">
                {{ formatIDR(p.amount) }}
              </td>
              <td class="px-3 py-2">
                <UBadge
                  :label="statusMeta(PAYMENT_STATUS_META, p.status).label"
                  :color="statusMeta(PAYMENT_STATUS_META, p.status).color"
                  variant="subtle"
                />
                <p
                  v-if="p.rawStatus"
                  class="mt-0.5 text-xs text-dimmed"
                >
                  {{ p.rawStatus }}<span v-if="p.paymentType"> · {{ p.paymentType }}</span>
                </p>
              </td>
              <td class="px-3 py-2 text-xs text-muted">
                {{ formatDateTimeId(p.paidAt ?? p.createdAt, auth.displayTimezone.value) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
