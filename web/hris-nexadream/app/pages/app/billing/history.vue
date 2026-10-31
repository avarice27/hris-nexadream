<script setup lang="ts">
import { formatDateTimeId, formatIDR } from '#shared/utils/format'
import { BILLING_PERIOD_LABELS } from '#shared/utils/payments'
import { PAYMENT_STATUS_META, statusMeta } from '#shared/utils/status'
import type { BillingPayment } from '~/composables/useBilling'

definePageMeta({ layout: 'tenant' })
useHead({ title: 'Riwayat pembayaran' })

const auth = useTenantAuth()
const page = ref(1)
const limit = 10
const data = ref<{ items: BillingPayment[], meta: { total: number, pageCount: number } } | null>(null)
const status = ref<'loading' | 'error' | 'success'>('loading')
const errorMessage = ref('')

async function load() {
  status.value = 'loading'
  try {
    data.value = await apiFetch('/api/app/subscription/payments', { query: { page: page.value, limit } })
    status.value = 'success'
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
    status.value = 'error'
  }
}
onMounted(load)
watch(page, load)
</script>

<template>
  <PagePanel title="Riwayat pembayaran">
    <template #actions>
      <UButton
        to="/app/billing"
        label="Langganan"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
      />
    </template>

    <div
      v-if="status === 'loading' && !data"
      class="space-y-2"
    >
      <USkeleton
        v-for="i in 5"
        :key="i"
        class="h-14 w-full"
      />
    </div>
    <UAlert
      v-else-if="status === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />
    <div
      v-else-if="data && !data.items.length"
      class="py-16 text-center text-sm text-muted"
    >
      Belum ada pembayaran.
    </div>
    <template v-else-if="data">
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li
            v-for="payment in data.items"
            :key="payment.id"
            class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
          >
            <div class="min-w-0 flex-1">
              <p class="font-medium">
                {{ payment.planSlug }} · {{ BILLING_PERIOD_LABELS[payment.period] }}
              </p>
              <p class="text-xs text-muted">
                {{ payment.orderId }} · {{ formatDateTimeId(payment.paidAt ?? payment.createdAt, auth.displayTimezone.value) }}
                <span v-if="payment.paymentType"> · {{ payment.paymentType }}</span>
              </p>
            </div>
            <span class="tabular font-medium">{{ formatIDR(payment.amount) }}</span>
            <UBadge
              :label="statusMeta(PAYMENT_STATUS_META, payment.status).label"
              :color="statusMeta(PAYMENT_STATUS_META, payment.status).color"
              variant="subtle"
            />
            <UButton
              v-if="payment.hasInvoice"
              :to="`/app/billing/invoices/${payment.id}`"
              label="Invoice"
              icon="i-lucide-file-text"
              size="xs"
              variant="outline"
              color="neutral"
            />
          </li>
        </ul>
      </UCard>
      <div
        v-if="data.meta.pageCount > 1"
        class="mt-4 flex justify-center"
      >
        <UPagination
          v-model:page="page"
          :total="data.meta.total"
          :items-per-page="limit"
        />
      </div>
    </template>
  </PagePanel>
</template>
