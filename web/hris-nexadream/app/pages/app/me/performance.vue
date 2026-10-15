<script setup lang="ts">
import type { ReviewView } from '~/types/hr'

definePageMeta({ layout: 'tenant' })
useHead({ title: 'Kinerja' })

const items = ref<ReviewView[] | null>(null)
const errorMessage = ref('')
async function load() {
  try {
    items.value = (await apiFetch<{ items: ReviewView[] }>('/api/app/me/performance')).items
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold text-highlighted">
      Kinerja
    </h1>
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!items"
      class="h-40 w-full"
    />
    <UCard v-else-if="!items.length">
      <p class="text-center text-sm text-muted">
        Belum ada penilaian kinerja untuk Anda.
      </p>
    </UCard>
    <UCard
      v-for="r in items"
      :key="r.id"
    >
      <ReviewCard
        :review="r"
        mode="self"
        @saved="load"
      />
    </UCard>
  </div>
</template>
