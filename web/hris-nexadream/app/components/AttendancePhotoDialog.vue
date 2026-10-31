<script setup lang="ts">
// Penampil foto selfie absen (HR/atasan). Foto = data pribadi: tautan privat berumur ≤ 5 menit,
// tidak disimpan di klien, dan setiap pembukaan tercatat di log akses data sensitif.
interface Photo { url: string, time: string | null, name: string | null }
interface PhotoResponse { employee: { fullName: string, employeeNumber: string }, date: string, clockIn: Photo | null, clockOut: Photo | null }

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ employeeId: string | null, date: string, employeeName?: string }>()

const data = ref<PhotoResponse | null>(null)
const errorMessage = ref('')
const loading = ref(false)

watch(() => [open.value, props.employeeId, props.date] as const, async ([isOpen, employeeId, date]) => {
  data.value = null
  errorMessage.value = ''
  if (!isOpen || !employeeId) return
  loading.value = true
  try {
    data.value = await apiFetch<PhotoResponse>(`/api/app/attendance/employees/${employeeId}/photos`, { query: { date } })
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  } finally {
    loading.value = false
  }
}, { immediate: true })

const photos = computed(() => data.value
  ? [{ key: 'in', label: 'Masuk', photo: data.value.clockIn }, { key: 'out', label: 'Pulang', photo: data.value.clockOut }]
  : [])
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`Foto absen ${employeeName ?? ''}`"
    :description="formatDateShort(date)"
  >
    <template #body>
      <USkeleton
        v-if="loading"
        class="h-64 w-full"
      />
      <UAlert
        v-else-if="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
      />
      <div
        v-else-if="data"
        class="space-y-3"
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <figure
            v-for="p in photos"
            :key="p.key"
            class="space-y-1"
          >
            <img
              v-if="p.photo"
              :src="p.photo.url"
              :alt="`Foto absen ${p.label.toLowerCase()} ${data.employee.fullName}`"
              class="aspect-[3/4] w-full rounded-md border border-default bg-elevated object-cover"
              referrerpolicy="no-referrer"
            >
            <div
              v-else
              class="flex aspect-[3/4] w-full items-center justify-center rounded-md border border-dashed border-default text-sm text-muted"
            >
              Tanpa foto
            </div>
            <figcaption class="text-sm">
              {{ p.label }}<span
                v-if="p.photo?.time"
                class="tabular text-muted"
              > · {{ p.photo.time }}</span>
            </figcaption>
          </figure>
        </div>
        <p class="text-xs text-muted">
          Foto ini data pribadi. Pembukaan tercatat di log akses; tautan berlaku 5 menit.
        </p>
      </div>
    </template>
  </UModal>
</template>
