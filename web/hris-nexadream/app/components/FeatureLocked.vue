<script setup lang="ts">
import { FEATURE_META, type FeatureKey } from '#shared/utils/plans'

// Tampilan halaman fitur berbayar yang belum termasuk paket. Datanya tidak hilang.
const props = defineProps<{ feature: FeatureKey }>()
const entitlements = useEntitlements()
const meta = computed(() => FEATURE_META[props.feature])
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <span class="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
      <UIcon
        name="i-lucide-lock"
        class="size-6"
      />
    </span>
    <h2 class="text-lg font-semibold">
      {{ meta.label }} belum termasuk paket Anda
    </h2>
    <p class="max-w-md text-sm text-muted">
      {{ meta.hint }} Data yang sudah ada tetap aman dan muncul kembali begitu paket ditingkatkan.
    </p>
    <UButton
      label="Lihat pilihan paket"
      icon="i-lucide-sparkles"
      @click="entitlements.upgradeRequired(feature)"
    />
  </div>
</template>
