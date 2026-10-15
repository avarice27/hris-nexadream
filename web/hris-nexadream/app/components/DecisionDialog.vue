<script setup lang="ts">
// Dialog setujui/tolak pengajuan. Mengembalikan { decision, note, approvedAmount? } atau null.
const props = defineProps<{ title: string, description?: string, decision: 'approved' | 'rejected', maxAmount?: number | null }>()
const emit = defineEmits<{ close: [{ decision: 'approved' | 'rejected', note: string | null, approvedAmount?: number | null } | null] }>()
const note = ref('')
const amount = ref<number | undefined>(props.maxAmount ?? undefined)
const reject = computed(() => props.decision === 'rejected')
function submit() {
  emit('close', { decision: props.decision, note: note.value.trim() || null, ...(props.maxAmount != null && !reject.value ? { approvedAmount: amount.value ?? props.maxAmount } : {}) })
}
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :close="false"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          v-if="maxAmount != null && !reject"
          label="Nominal disetujui"
          :hint="`Maks. ${formatIDR(maxAmount)}`"
        >
          <UInputNumber
            v-model="amount"
            :min="0"
            :max="maxAmount"
            :step="1000"
            :format-options="{ style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }"
            locale="id-ID"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="reject ? 'Alasan penolakan' : 'Catatan (opsional)'"
          :hint="reject ? 'Disampaikan ke karyawan' : undefined"
        >
          <UTextarea
            v-model="note"
            :rows="3"
            class="w-full"
            autofocus
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Batal"
          color="neutral"
          variant="ghost"
          @click="emit('close', null)"
        />
        <UButton
          :label="reject ? 'Tolak' : 'Setujui'"
          :color="reject ? 'error' : 'primary'"
          :icon="reject ? 'i-lucide-x' : 'i-lucide-check'"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
