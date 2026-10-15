<script setup lang="ts">
// Pemilih karyawan: pencarian di server (≥ 2 karakter, debounce 300 ms) — daftar besar tidak pernah dimuat sekaligus.
interface Brief { id: string, fullName: string, employeeNumber: string, positionName: string | null }

const props = withDefaults(defineProps<{ initialLabel?: string | null, placeholder?: string, excludeId?: string | null }>(), { initialLabel: null, placeholder: 'Cari nama atau NIP…', excludeId: null })
const model = defineModel<string | null | undefined>()
// USelectMenu tidak menerima null; null dari induk = belum dipilih.
const inner = computed({ get: () => model.value ?? undefined, set: (v: string | undefined) => (model.value = v ?? null) })
const searchTerm = ref('')
const loading = ref(false)
const items = ref<Array<{ label: string, value: string, description?: string }>>([])

watch(() => props.initialLabel, (label) => {
  if (label && model.value && !items.value.some(i => i.value === model.value)) items.value = [{ label, value: model.value }]
}, { immediate: true })

let timer: ReturnType<typeof setTimeout> | undefined
watch(searchTerm, (q) => {
  clearTimeout(timer)
  if (q.trim().length < 2) return
  timer = setTimeout(async () => {
    loading.value = true
    try {
      const res = await apiFetch<{ items: Brief[] }>('/api/app/employees/search', { query: { q } })
      items.value = res.items.filter(e => e.id !== props.excludeId).map(e => ({ label: e.fullName, value: e.id, description: [e.employeeNumber, e.positionName].filter(Boolean).join(' · ') }))
    } finally {
      loading.value = false
    }
  }, 300)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <USelectMenu
    v-model="inner"
    v-model:search-term="searchTerm"
    :items="items"
    value-key="value"
    :loading="loading"
    :placeholder="placeholder"
    ignore-filter
    class="w-full"
    :search-input="{ placeholder: 'Ketik minimal 2 huruf…' }"
  >
    <template #empty>
      {{ searchTerm.length < 2 ? 'Ketik minimal 2 huruf' : 'Tidak ditemukan' }}
    </template>
  </USelectMenu>
</template>
