<script setup lang="ts">
withDefaults(defineProps<{ title?: string, description?: string }>(), {
  title: 'Segera hadir',
  description: 'Fitur ini sedang kami siapkan.'
})
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <span class="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
      <UIcon
        name="i-lucide-hammer"
        class="size-6"
      />
    </span>
    <h2 class="text-lg font-semibold">
      {{ title }}
    </h2>
    <p class="max-w-md text-sm text-muted">
      {{ description }}
    </p>
  </div>
</template>
