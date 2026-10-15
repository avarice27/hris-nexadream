<script setup lang="ts">
import { statusMeta, type StatusMeta } from '#shared/utils/status'

// Satu-satunya cara menampilkan nilai enum: lewat peta label (design.md §1.4).
const props = withDefaults(defineProps<{ map: Record<string, StatusMeta>, value: string | null | undefined, size?: 'xs' | 'sm' | 'md' }>(), { size: 'sm' })
const meta = computed(() => statusMeta(props.map, props.value))
</script>

<template>
  <UBadge
    :label="meta.label"
    :color="meta.color"
    variant="subtle"
    :size="size"
  />
</template>
