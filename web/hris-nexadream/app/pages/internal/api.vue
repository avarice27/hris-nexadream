<script setup lang="ts">
import type { ApiSection } from '#shared/utils/api-docs'

// Referensi lengkap (semua endpoint v1). Hanya bila app.internalApiDocsEnabled; tidak diindeks.
definePageMeta({ layout: 'public' })
useSeoMeta({ title: 'API internal', robots: 'noindex, nofollow' })
const { data, error } = await useFetch<{ baseUrl: string, sections: ApiSection[], errors: Array<{ code: string, status: number, meaning: string }> }>('/api/public/api-docs', { key: 'api-docs-internal', query: { scope: 'internal' } })
if (error.value) throw createError({ statusCode: 404, statusMessage: 'Halaman tidak ditemukan', fatal: true })
</script>

<template>
  <UContainer class="py-12 sm:py-16">
    <h1 class="text-3xl font-semibold text-highlighted">
      Referensi API lengkap
    </h1>
    <p class="mt-2 text-muted">
      Termasuk endpoint aplikasi mobile (token Bearer).
    </p>
    <div class="mt-10">
      <ApiDocsView
        v-if="data"
        :data="data"
        internal
      />
    </div>
  </UContainer>
</template>
