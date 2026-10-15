<script setup lang="ts">
// Dialog konfirmasi tunggal untuk aksi destruktif — selalu menyebut akibatnya.
defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  color?: 'primary' | 'error' | 'warning'
}>()
const emit = defineEmits<{ close: [boolean] }>()
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :close="false"
    :dismissible="false"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Batal"
          color="neutral"
          variant="ghost"
          @click="emit('close', false)"
        />
        <UButton
          :label="confirmLabel ?? 'Lanjutkan'"
          :color="color ?? 'primary'"
          @click="emit('close', true)"
        />
      </div>
    </template>
  </UModal>
</template>
