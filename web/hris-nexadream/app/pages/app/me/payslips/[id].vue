<script setup lang="ts">
import type { PayslipDetail } from '~/types/hr'

definePageMeta({ layout: 'tenant' })
useHead({ title: 'Slip gaji' })

const route = useRoute()
const payslip = ref<PayslipDetail | null>(null)
const errorMessage = ref('')
const printPage = () => window.print()
onMounted(async () => {
  try {
    payslip.value = await apiFetch<PayslipDetail>(`/api/app/me/payslips/${route.params.id}`)
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <UButton
        to="/app/me/payslips"
        icon="i-lucide-arrow-left"
        label="Semua slip"
        variant="ghost"
        color="neutral"
      />
      <UButton
        v-if="payslip"
        icon="i-lucide-printer"
        label="Cetak / simpan PDF"
        variant="outline"
        @click="printPage"
      />
    </div>
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!payslip"
      class="h-96 w-full"
    />
    <UCard v-else>
      <PayslipView :payslip="payslip" />
    </UCard>
  </div>
</template>
