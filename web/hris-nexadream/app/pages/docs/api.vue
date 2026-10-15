<script setup lang="ts">
import type { ApiSection } from '#shared/utils/api-docs'

// Referensi API publik untuk integrator (SSR, terindeks) — dibangun dari katalog bersama.
definePageMeta({ layout: 'public' })
const { data } = await useFetch<{ baseUrl: string, sections: ApiSection[], errors: Array<{ code: string, status: number, meaning: string }> }>('/api/public/api-docs', { key: 'api-docs-public' })
useSeoMeta({
  title: 'Dokumentasi API',
  description: 'Referensi REST API HRIS Nexadream untuk integrasi: karyawan, kehadiran, cuti, dan payroll dengan API key.'
})
</script>

<template>
  <UContainer class="py-12 sm:py-16">
    <h1 class="text-3xl font-semibold text-highlighted">
      Dokumentasi API
    </h1>
    <p class="mt-2 max-w-2xl text-muted">
      Hubungkan HRIS Nexadream dengan ERP, sistem akuntansi, atau aplikasi internal Anda.
    </p>
    <div class="mt-10">
      <ApiDocsView
        v-if="data"
        :data="data"
      />
    </div>
  </UContainer>
</template>
