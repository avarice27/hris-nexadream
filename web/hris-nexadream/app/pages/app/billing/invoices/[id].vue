<script setup lang="ts">
import type { InvoiceDocumentData } from '~/components/InvoiceDocument.vue'

// Invoice pembayaran langganan (id = id pembayaran). Cetak / simpan PDF lewat dialog cetak peramban.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Invoice' })

const route = useRoute()
const invoice = ref<InvoiceDocumentData | null>(null)
const errorMessage = ref('')

function printPage() {
  window.print()
}

onMounted(async () => {
  try {
    invoice.value = await apiFetch<InvoiceDocumentData>(`/api/app/subscription/payments/${route.params.id}/invoice`)
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
})
</script>

<template>
  <PagePanel title="Invoice">
    <template #actions>
      <UButton
        to="/app/billing/history"
        label="Riwayat"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
      />
      <UButton
        v-if="invoice"
        label="Cetak / simpan PDF"
        icon="i-lucide-printer"
        @click="printPage"
      />
    </template>
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!invoice"
      class="mx-auto h-96 max-w-3xl"
    />
    <InvoiceDocument
      v-else
      :invoice="invoice"
    />
  </PagePanel>
</template>
