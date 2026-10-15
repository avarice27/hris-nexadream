<script setup lang="ts">
// Alasan wajib sebelum masuk sebagai perusahaan/staf. Ditutup dengan alasan → induk menjalankan aksi.
const props = defineProps<{ title: string, description?: string }>()
const emit = defineEmits<{ close: [string | null] }>()
const reason = ref('')
const valid = computed(() => reason.value.trim().length >= 10)
</script>

<template>
  <UModal
    :title="props.title"
    :description="props.description"
    @update:open="(v: boolean) => !v && emit('close', null)"
  >
    <template #body>
      <div class="space-y-3">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-shield-alert"
          title="Sesi dukungan 30 menit, dicatat di log aktivitas."
          description="Data sensitif karyawan (NIK, NPWP, gaji, rekening, dokumen) tetap terkunci, dan pembayaran tidak bisa dilakukan."
        />
        <UFormField
          label="Alasan"
          help="Minimal 10 karakter, atau nomor tiket dukungan."
          required
        >
          <UTextarea
            v-model="reason"
            :rows="3"
            autoresize
            class="w-full"
            placeholder="Tiket #123: membantu mengatur kantor"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Batal"
          variant="ghost"
          color="neutral"
          @click="emit('close', null)"
        />
        <UButton
          label="Masuk sebagai"
          icon="i-lucide-log-in"
          color="warning"
          :disabled="!valid"
          @click="emit('close', reason.trim())"
        />
      </div>
    </template>
  </UModal>
</template>
