<script setup lang="ts">
const config = useRuntimeConfig()

useHead({
  htmlAttrs: { lang: 'id' },
  titleTemplate: title => title ? `${title} · ${config.public.appName}` : config.public.appName,
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  meta: [{ name: 'theme-color', content: '#4F46E5' }]
})
</script>

<template>
  <UApp :toaster="{ position: 'top-right' }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
