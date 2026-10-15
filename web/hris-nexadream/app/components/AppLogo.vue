<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
</script>

<template>
  <span class="inline-flex items-center gap-2 font-semibold text-highlighted">
    <span class="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-inverted">
      <UIcon
        name="i-lucide-users-round"
        class="size-5"
      />
    </span>
    <span
      v-if="!compact"
      class="truncate"
    >HRIS <span class="text-primary">Nexadream</span></span>
  </span>
</template>
