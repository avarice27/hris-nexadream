<script setup lang="ts">
import { ATTENDANCE_STATUS_META } from '#shared/utils/status'

// Kartu absen masuk/pulang (ESS). Lokasi hanya diminta bila perusahaan mewajibkan geofence;
// selfie hanya bila diwajibkan. Server tetap memvalidasi jarak & foto.
interface Today {
  date: string
  timezone: string
  branchName: string
  schedule: { kind: 'work' | 'off' | 'holiday', shiftName: string | null, startTime: string | null, endTime: string | null, holidayName: string | null }
  onLeave: string | null
  record: { clockInTime: string | null, clockOutTime: string | null, status: string, lateMinutes: number, workedMinutes: number, autoClosed: boolean } | null
  canClockIn: boolean
  canClockOut: boolean
  policy: { requireGeofence: boolean, requireSelfie: boolean, geofence: { latitude: number, longitude: number, radiusMeters: number } | null }
}

const props = defineProps<{ initial?: Today | null }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useApiToast()
const today = ref<Today | null>(props.initial ?? null)
const loading = ref(!props.initial)
const busy = ref(false)
const errorMessage = ref('')
const photoInput = ref<HTMLInputElement | null>(null)
const pendingAction = ref<'in' | 'out' | null>(null)
const now = ref(new Date())
let tick: ReturnType<typeof setInterval> | undefined

async function load() {
  try {
    today.value = await apiFetch<Today>('/api/app/me/attendance/today')
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  if (!props.initial) load()
  tick = setInterval(() => (now.value = new Date()), 30_000)
})
onBeforeUnmount(() => clearInterval(tick))

const clock = computed(() => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: today.value?.timezone ?? 'Asia/Jakarta' }).format(now.value))
const zone = computed(() => ({ 'Asia/Jakarta': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT' } as Record<string, string>)[today.value?.timezone ?? ''] ?? '')

function position(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 })
  })
}

async function start(action: 'in' | 'out') {
  if (today.value?.policy.requireSelfie) {
    pendingAction.value = action
    photoInput.value?.click()
    return
  }
  await submit(action, null)
}

async function onPhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file || !pendingAction.value) return
  busy.value = true
  try {
    const uploaded = await uploadFileToApi('/api/app/me/attendance/photo', file, {}, 720)
    await submit(pendingAction.value, uploaded.id)
  } catch (error) {
    toast.error(error)
  } finally {
    busy.value = false
    pendingAction.value = null
  }
}

async function submit(action: 'in' | 'out', photoFileId: string | null) {
  busy.value = true
  try {
    const pos = today.value?.policy.requireGeofence ? await position() : null
    if (today.value?.policy.requireGeofence && !pos) {
      toast.error(null, 'Izinkan akses lokasi di browser untuk absen di kantor ini.')
      return
    }
    await apiFetch(`/api/app/me/attendance/${action === 'in' ? 'clock-in' : 'clock-out'}`, {
      method: 'POST',
      body: { latitude: pos?.coords.latitude ?? null, longitude: pos?.coords.longitude ?? null, accuracy: pos?.coords.accuracy ?? null, photoFileId }
    })
    toast.success(action === 'in' ? 'Absen masuk tercatat' : 'Absen pulang tercatat')
    await load()
    emit('changed')
  } catch (error) {
    toast.error(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UCard>
    <USkeleton
      v-if="loading"
      class="h-40 w-full"
    />
    <UAlert
      v-else-if="errorMessage"
      color="warning"
      variant="subtle"
      icon="i-lucide-info"
      :title="errorMessage"
    />
    <div
      v-else-if="today"
      class="flex flex-col items-center gap-3 py-2 text-center"
    >
      <p class="text-sm text-muted">
        {{ formatDayShort(today.date) }} · {{ today.branchName }}
      </p>
      <p class="text-5xl font-semibold tabular text-highlighted">
        {{ clock }} <span class="text-base font-normal text-muted">{{ zone }}</span>
      </p>
      <p class="text-sm">
        <template v-if="today.onLeave">
          <UIcon
            name="i-lucide-plane"
            class="size-4 align-[-2px] text-info"
          /> Anda sedang cuti: {{ today.onLeave }}
        </template>
        <template v-else-if="today.schedule.kind === 'holiday'">
          Libur: {{ today.schedule.holidayName }}
        </template>
        <template v-else-if="today.schedule.kind === 'off'">
          Hari ini bukan hari kerja Anda.
        </template>
        <template v-else>
          Jadwal {{ today.schedule.shiftName }}: {{ today.schedule.startTime }}–{{ today.schedule.endTime }}
        </template>
      </p>

      <div
        v-if="today.record"
        class="flex flex-wrap justify-center gap-4 text-sm"
      >
        <span>Masuk <strong class="tabular">{{ today.record.clockInTime ?? '–' }}</strong></span>
        <span>Pulang <strong class="tabular">{{ today.record.clockOutTime ?? '–' }}</strong></span>
        <StatusBadge
          :map="ATTENDANCE_STATUS_META"
          :value="today.record.status"
        />
        <span
          v-if="today.record.lateMinutes"
          class="text-warning"
        >Terlambat {{ formatMinutes(today.record.lateMinutes) }}</span>
      </div>

      <div class="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
        <UButton
          v-if="today.canClockIn"
          label="Absen masuk"
          icon="i-lucide-log-in"
          size="xl"
          block
          :loading="busy"
          @click="start('in')"
        />
        <UButton
          v-if="today.canClockOut"
          label="Absen pulang"
          icon="i-lucide-log-out"
          size="xl"
          color="neutral"
          block
          :loading="busy"
          @click="start('out')"
        />
        <p
          v-if="!today.canClockIn && !today.canClockOut"
          class="w-full text-sm text-success"
        >
          <UIcon
            name="i-lucide-circle-check"
            class="size-4 align-[-2px]"
          /> Absensi hari ini lengkap.
        </p>
      </div>
      <p
        v-if="today.policy.requireGeofence || today.policy.requireSelfie"
        class="text-xs text-muted"
      >
        {{ [today.policy.requireGeofence ? 'Lokasi Anda diperiksa saat absen' : '', today.policy.requireSelfie ? 'selfie diperlukan' : ''].filter(Boolean).join(' · ') }}
      </p>
      <input
        ref="photoInput"
        type="file"
        accept="image/*"
        capture="user"
        class="hidden"
        @change="onPhoto"
      >
    </div>
  </UCard>
</template>
