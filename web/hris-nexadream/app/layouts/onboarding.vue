<script setup lang="ts">
const auth = useTenantAuth()
</script>

<template>
  <div class="min-h-dvh bg-muted">
    <header class="border-b border-default bg-default">
      <UContainer class="flex h-14 items-center justify-between">
        <AppLogo />
        <UButton
          label="Keluar"
          variant="ghost"
          color="neutral"
          icon="i-lucide-log-out"
          size="sm"
          @click="auth.logout()"
        />
      </UContainer>
    </header>
    <main class="px-4 py-8 sm:py-12">
      <div class="mx-auto w-full max-w-2xl">
        <slot />
      </div>
    </main>
  </div>
</template>
