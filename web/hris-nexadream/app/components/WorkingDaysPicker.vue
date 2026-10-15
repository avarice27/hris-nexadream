<script setup lang="ts">
import { WEEKDAY_LABELS } from '#shared/utils/identifiers'

// Pemilih hari kerja (0 = Minggu … 6 = Sabtu), ditampilkan mulai Senin.
const model = defineModel<number[]>({ default: () => [] })
defineProps<{ disabled?: boolean }>()
const order = [1, 2, 3, 4, 5, 6, 0]

function toggle(day: number) {
  model.value = model.value.includes(day) ? model.value.filter(d => d !== day) : [...model.value, day].sort()
}
</script>

<template>
  <div
    class="flex flex-wrap gap-2"
    role="group"
    aria-label="Hari kerja"
  >
    <UButton
      v-for="day in order"
      :key="day"
      :label="WEEKDAY_LABELS[day]"
      size="sm"
      :variant="model.includes(day) ? 'solid' : 'outline'"
      :color="model.includes(day) ? 'primary' : 'neutral'"
      :aria-pressed="model.includes(day)"
      :disabled="disabled"
      @click="toggle(day)"
    />
  </div>
</template>
