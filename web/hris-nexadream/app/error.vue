<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const title = computed(() => props.error.statusCode === 404 ? 'Halaman tidak ditemukan' : 'Terjadi kesalahan')
const description = computed(() => props.error.statusCode === 404
  ? 'Halaman yang Anda cari tidak ada atau sudah dipindahkan.'
  : 'Maaf, ada yang tidak beres. Silakan coba lagi.')

useHead({ title: title.value })
</script>

<template>
  <UApp>
    <div class="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p class="text-5xl font-semibold text-primary">
        {{ error.statusCode }}
      </p>
      <h1 class="text-2xl font-semibold">
        {{ title }}
      </h1>
      <p class="text-muted max-w-md">
        {{ description }}
      </p>
      <UButton
        label="Kembali ke beranda"
        @click="clearError({ redirect: '/' })"
      />
    </div>
  </UApp>
</template>
