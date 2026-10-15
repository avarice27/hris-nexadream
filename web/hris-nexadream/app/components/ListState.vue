<script setup lang="ts">
// Status standar daftar: memuat / galat / kosong. Isi daftar di slot default.
defineProps<{ status: 'loading' | 'error' | 'success', error?: string, empty?: boolean, emptyText?: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div
    v-if="status === 'loading'"
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
    :title="error"
  >
    <template #actions>
      <UButton
        label="Coba lagi"
        size="xs"
        @click="$emit('retry')"
      />
    </template>
  </UAlert>
  <p
    v-else-if="empty"
    class="py-12 text-center text-sm text-muted"
  >
    {{ emptyText ?? 'Tidak ada data.' }}
  </p>
  <slot v-else />
</template>
