<script setup lang="ts">
definePageMeta({ layout: 'public' })
const route = useRoute()
</script>

<template>
  <CmsPageView :slug="String(route.params.slug)" />
</template>
