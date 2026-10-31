<script setup lang="ts">
import type { InvoiceDocumentData } from '~/components/InvoiceDocument.vue'

// Back-office: invoice pembayaran langganan + pencatatan nomor Faktur Pajak (Coretax DJP).
definePageMeta({ layout: 'admin' })
useHead({ title: 'Invoice' })

const route = useRoute()
const auth = usePlatformAuth()
const toast = useToast()
const canWrite = computed(() => auth.hasPermission('payments.write'))
const invoice = ref<InvoiceDocumentData | null>(null)
const errorMessage = ref('')
const taxInvoiceNumber = ref('')
const saving = ref(false)
const endpoint = computed(() => `/api/admin/payments/${route.params.id}/invoice`)

function printPage() {
  window.print()
}

onMounted(async () => {
  try {
    invoice.value = await apiFetch<InvoiceDocumentData>(endpoint.value)
    taxInvoiceNumber.value = invoice.value.taxInvoiceNumber ?? ''
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
})

async function saveTaxInvoiceNumber() {
  if (!invoice.value) return
  saving.value = true
  try {
    const result = await apiFetch<{ taxInvoiceNumber: string | null }>(endpoint.value, { method: 'PATCH', body: { taxInvoiceNumber: taxInvoiceNumber.value || null } })
    invoice.value = { ...invoice.value, taxInvoiceNumber: result.taxInvoiceNumber }
    toast.add({ title: 'Nomor Faktur Pajak disimpan.', color: 'success' })
  } catch (error) {
    toast.add({ title: extractErrorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PagePanel title="Invoice">
    <template #actions>
      <UButton
        to="/admin/payments"
        label="Pembayaran"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
      />
      <UButton
        v-if="invoice"
        label="Cetak"
        icon="i-lucide-printer"
        @click="printPage"
      />
    </template>
    <div class="space-y-4">
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
      <template v-else>
        <UCard
          v-if="canWrite"
          class="mx-auto max-w-3xl print:hidden"
        >
          <form
            class="flex flex-wrap items-end gap-3"
            @submit.prevent="saveTaxInvoiceNumber"
          >
            <UFormField
              label="Nomor Faktur Pajak (Coretax)"
              hint="Isi setelah Faktur Pajak terbit di Coretax DJP."
              class="min-w-64 flex-1"
            >
              <UInput
                v-model="taxInvoiceNumber"
                placeholder="mis. 04002600000000001"
                class="w-full"
              />
            </UFormField>
            <UButton
              type="submit"
              label="Simpan"
              :loading="saving"
            />
          </form>
        </UCard>
        <InvoiceDocument :invoice="invoice" />
      </template>
    </div>
  </PagePanel>
</template>
