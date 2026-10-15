<script setup lang="ts">
const config = useRuntimeConfig()
</script>

<template>
  <div class="min-h-dvh flex flex-col items-center justify-center gap-6 bg-muted px-4 py-10">
    <div class="flex items-center gap-2">
      <AppLogo />
      <UBadge
        label="Admin"
        variant="subtle"
      />
    </div>
    <UCard
      class="w-full max-w-md"
      :ui="{ body: 'p-6 sm:p-8' }"
    >
      <slot />
    </UCard>
    <p class="text-xs text-muted">
      Back-office · v{{ config.public.appVersion }}
    </p>
  </div>
</template>
