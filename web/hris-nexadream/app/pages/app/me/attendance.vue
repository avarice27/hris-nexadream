<script setup lang="ts">
import { ATTENDANCE_STATUS_META, REQUEST_STATUS_META } from '#shared/utils/status'

// Absensi saya: kartu absen, kalender bulan berjalan, dan pengajuan koreksi.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Absensi' })

interface Day { date: string, status: string | null, schedule: { kind: string, startTime: string | null, endTime: string | null, holidayName: string | null }, leave: string | null, record: { clockInTime: string | null, clockOutTime: string | null, lateMinutes: number, workedMinutes: number, corrected: boolean, autoClosed: boolean } | null }
interface Calendar { days: Day[], summary: { scheduledDays: number, presentDays: number, lateDays: number, absentDays: number, leaveDays: number, lateMinutes: number } }
interface Correction { id: string, code: string, workDate: string, requestedClockIn: string | null, requestedClockOut: string | null, reason: string, status: string, createdAt: string }

const toast = useApiToast()
const month = ref(localTodayKey().slice(0, 7))
const calendar = ref<Calendar | null>(null)
const corrections = ref<Correction[]>([])
const errorMessage = ref('')

const range = computed(() => {
  const [y, m] = month.value.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const today = localTodayKey()
  return { from: `${month.value}-01`, to: last < today ? last : today }
})

async function load() {
  try {
    const [cal, corr] = await Promise.all([
      apiFetch<Calendar>('/api/app/me/attendance/calendar', { query: range.value }),
      apiFetch<{ items: Correction[] }>('/api/app/me/attendance/corrections')
    ])
    calendar.value = cal
    corrections.value = corr.items
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)
watch(month, load)

// Koreksi
const open = ref(false)
const saving = ref(false)
const formError = ref('')
const form = reactive({ workDate: '', clockIn: '', clockOut: '', reason: '' })
function openCorrection(day?: Day) {
  Object.assign(form, { workDate: day?.date ?? localTodayKey(), clockIn: day?.record?.clockInTime ?? '', clockOut: day?.record?.clockOutTime ?? '', reason: '' })
  formError.value = ''
  open.value = true
}
async function submitCorrection() {
  saving.value = true
  formError.value = ''
  try {
    await apiFetch('/api/app/me/attendance/corrections', { method: 'POST', body: { workDate: form.workDate, clockIn: form.clockIn || null, clockOut: form.clockOut || null, reason: form.reason } })
    open.value = false
    toast.success('Koreksi diajukan', 'Menunggu persetujuan atasan.')
    await load()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  } finally {
    saving.value = false
  }
}
async function cancelCorrection(id: string) {
  try {
    await apiFetch(`/api/app/me/attendance/corrections/${id}`, { method: 'DELETE' })
    toast.success('Koreksi dibatalkan')
    await load()
  } catch (error) {
    toast.error(error)
  }
}
const days = computed(() => [...(calendar.value?.days ?? [])].reverse())
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold text-highlighted">
        Absensi
      </h1>
      <UButton
        label="Ajukan koreksi"
        icon="i-lucide-pencil-line"
        variant="outline"
        @click="openCorrection()"
      />
    </div>
    <AttendanceClockCard @changed="load" />

    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="font-semibold">
        Riwayat
      </h2>
      <UInput
        v-model="month"
        type="month"
        class="w-44"
        aria-label="Bulan"
      />
    </div>
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />
    <template v-else-if="calendar">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <UCard
          v-for="s in [
            { l: 'Hari kerja', v: calendar.summary.scheduledDays },
            { l: 'Hadir', v: calendar.summary.presentDays },
            { l: 'Terlambat', v: calendar.summary.lateDays },
            { l: 'Cuti', v: calendar.summary.leaveDays },
            { l: 'Tidak hadir', v: calendar.summary.absentDays }
          ]"
          :key="s.l"
          :ui="{ body: 'p-3 sm:p-3' }"
        >
          <p class="text-xs text-muted">
            {{ s.l }}
          </p>
          <p class="text-xl font-semibold tabular">
            {{ s.v }}
          </p>
        </UCard>
      </div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li
            v-for="day in days"
            :key="day.date"
            class="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
          >
            <span class="w-28 shrink-0 font-medium">{{ formatDayShort(day.date) }}</span>
            <span class="flex-1 tabular text-muted">
              <template v-if="day.record?.clockInTime">{{ day.record.clockInTime }} – {{ day.record.clockOutTime ?? '…' }}<span v-if="day.record.workedMinutes"> · {{ formatMinutes(day.record.workedMinutes) }}</span></template>
              <template v-else-if="day.leave">{{ day.leave }}</template>
              <template v-else-if="day.schedule.holidayName">{{ day.schedule.holidayName }}</template>
              <template v-else-if="day.schedule.kind === 'work'">Jadwal {{ day.schedule.startTime }}–{{ day.schedule.endTime }}</template>
            </span>
            <UBadge
              v-if="day.record?.corrected"
              label="Dikoreksi"
              size="xs"
              variant="outline"
              color="neutral"
            />
            <UBadge
              v-if="day.record?.autoClosed"
              label="Tutup otomatis"
              size="xs"
              variant="outline"
              color="warning"
            />
            <StatusBadge
              v-if="day.status"
              :map="ATTENDANCE_STATUS_META"
              :value="day.status"
            />
            <UButton
              v-if="day.schedule.kind === 'work' && (day.status === 'absent' || day.status === 'late' || (day.record && !day.record.clockOutTime))"
              icon="i-lucide-pencil-line"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Ajukan koreksi"
              @click="openCorrection(day)"
            />
          </li>
        </ul>
      </UCard>
    </template>
    <USkeleton
      v-else
      class="h-64 w-full"
    />

    <div v-if="corrections.length">
      <h2 class="mb-2 font-semibold">
        Pengajuan koreksi
      </h2>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li
            v-for="c in corrections"
            :key="c.id"
            class="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
          >
            <span class="font-mono text-xs text-muted">{{ c.code }}</span>
            <span class="font-medium">{{ formatDateShort(c.workDate) }}</span>
            <span class="flex-1 text-muted">{{ c.requestedClockIn ?? '–' }} / {{ c.requestedClockOut ?? '–' }} · {{ c.reason }}</span>
            <StatusBadge
              :map="REQUEST_STATUS_META"
              :value="c.status"
            />
            <UButton
              v-if="c.status === 'pending'"
              label="Batalkan"
              size="xs"
              variant="ghost"
              color="error"
              @click="cancelCorrection(c.id)"
            />
          </li>
        </ul>
      </UCard>
    </div>

    <UModal
      v-model:open="open"
      title="Ajukan koreksi absen"
      description="Atasan Anda akan meninjau koreksi ini."
    >
      <template #body>
        <form
          id="correction-form"
          class="space-y-4"
          @submit.prevent="submitCorrection"
        >
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />
          <UFormField label="Tanggal">
            <UInput
              v-model="form.workDate"
              type="date"
              :max="localTodayKey()"
              class="w-full"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Jam masuk">
              <UInput
                v-model="form.clockIn"
                type="time"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Jam pulang">
              <UInput
                v-model="form.clockOut"
                type="time"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField
            label="Alasan"
            required
          >
            <UTextarea
              v-model="form.reason"
              :rows="3"
              class="w-full"
              placeholder="Mis. lupa absen karena rapat di luar kantor"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Batal"
            variant="ghost"
            color="neutral"
            @click="open = false"
          />
          <UButton
            type="submit"
            form="correction-form"
            label="Ajukan"
            :loading="saving"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
