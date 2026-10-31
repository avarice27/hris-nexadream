<script setup lang="ts">
// Logo resmi Nexadream (public/images/nexadream-logo.png, dari nexadream.id).
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
</script>

<template>
  <span class="inline-flex items-center gap-2 font-semibold text-highlighted">
    <img
      src="/images/nexadream-logo.png"
      alt="Nexadream"
      width="32"
      height="32"
      class="size-8 shrink-0 object-contain"
    >
    <span
      v-if="!compact"
      class="truncate"
    >HRIS <span class="text-primary">Nexadream</span></span>
  </span>
</template>
