<script setup lang="ts">
// Grafik batang satu seri (tanpa legenda — judul kartu menamainya). Batang tipis dengan ujung
// membulat 4px di atas baseline, celah antarbatang, grid redup, tooltip per batang saat hover/fokus.
// Selalu didampingi tabel data di halaman pemanggil untuk akses tanpa warna/hover.
const props = defineProps<{
  data: Array<{ key: string, label: string, value: number, display: string }>
  /** Deskripsi grafik untuk pembaca layar */
  description: string
  height?: number
}>()

const max = computed(() => Math.max(1, ...props.data.map(d => d.value)))
const hovered = ref<string | null>(null)
const chartHeight = computed(() => props.height ?? 160)
</script>

<template>
  <figure
    class="w-full"
    :aria-label="description"
    role="img"
  >
    <div
      class="relative flex items-end gap-[2px] border-b border-default"
      :style="{ height: `${chartHeight}px` }"
    >
      <!-- Garis bantu 50% & 100%, redup -->
      <div class="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-default/60" />
      <div
        class="pointer-events-none absolute inset-x-0 border-t border-dashed border-default/40"
        :style="{ top: `${chartHeight / 2}px` }"
      />
      <div
        v-for="d in data"
        :key="d.key"
        class="group relative flex h-full flex-1 items-end justify-center"
        tabindex="0"
        :aria-label="`${d.label}: ${d.display}`"
        @mouseenter="hovered = d.key"
        @mouseleave="hovered = null"
        @focus="hovered = d.key"
        @blur="hovered = null"
      >
        <div
          class="w-full max-w-10 rounded-t-[4px] bg-primary transition-opacity"
          :class="hovered && hovered !== d.key ? 'opacity-50' : ''"
          :style="{ height: d.value > 0 ? `${Math.max(2, (d.value / max) * (chartHeight - 8))}px` : '0px' }"
        />
        <div
          v-if="hovered === d.key"
          class="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md bg-inverted px-2 py-1 text-xs text-inverted shadow"
        >
          <span class="font-medium">{{ d.label }}</span> · <span class="tabular">{{ d.display }}</span>
        </div>
      </div>
    </div>
    <div class="mt-1 flex gap-[2px]">
      <span
        v-for="(d, i) in data"
        :key="d.key"
        class="flex-1 truncate text-center text-[10px] text-muted"
      >
        {{ data.length <= 12 || i % Math.ceil(data.length / 12) === 0 ? d.label : '' }}
      </span>
    </div>
  </figure>
</template>
