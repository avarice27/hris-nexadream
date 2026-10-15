<template>
  <div class="min-h-dvh flex flex-col items-center justify-center gap-6 bg-muted px-4 py-10">
    <NuxtLink
      to="/"
      aria-label="Beranda HRIS Nexadream"
    >
      <AppLogo />
    </NuxtLink>
    <UCard
      class="w-full max-w-md"
      :ui="{ body: 'p-6 sm:p-8' }"
    >
      <slot />
    </UCard>
    <p class="text-xs text-muted">
      © {{ new Date().getFullYear() }} Nexadream
    </p>
  </div>
</template>
