<script setup lang="ts">
import { ATTENDANCE_STATUS_META, REQUEST_STATUS_META } from '#shared/utils/status'
import type { ApprovalStepView } from '~/types/hr'

// Kehadiran: papan harian (semua karyawan dalam cakupan) dan koreksi absen.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Kehadiran' })

interface Row {
  employeeId: string
  fullName: string
  employeeNumber: string
  branchName: string
  status: string
  leave: string | null
  schedule: { kind: string, startTime: string | null, endTime: string | null, holidayName: string | null }
  record: { clockInTime: string | null, clockOutTime: string | null, lateMinutes: number, workedMinutes: number, clockInDistanceMeters: number | null, hasPhoto: boolean, corrected: boolean, autoClosed: boolean } | null
}
interface Correction { id: string, code: string, workDate: string, employee: { id: string, fullName: string, employeeNumber: string } | null, requestedClockIn: string | null, requestedClockOut: string | null, reason: string, status: string, steps: ApprovalStepView[], canDecide: boolean }

const auth = useTenantAuth()
const toast = useApiToast()
const { decide } = useDecision()
const org = useOrgOptions()
const tab = ref('daily')
const date = ref(localTodayKey())
const statusFilter = ref<string | undefined>('__all__')
const branchFilter = ref<string | undefined>('__all__')
const dateRef = computed(() => date.value)
const list = useServerList<Row, { date: string, counts: Record<string, number> }>('/api/app/attendance/daily', { limit: 50, filters: { date: dateRef as Ref<string | undefined>, status: statusFilter, branchId: branchFilter } })
const corrStatus = ref<string | undefined>('pending')
const corrections = useServerList<Correction>('/api/app/attendance/corrections', { filters: { status: corrStatus } })
onMounted(() => org.load().catch(() => {}))

const counts = computed(() => list.extra.value.counts ?? {})
const chips = computed(() => [
  { key: '__all__', label: 'Semua', n: Object.values(counts.value).reduce((s, n) => s + n, 0) },
  ...['present', 'late', 'not_yet', 'absent', 'leave', 'off', 'holiday'].filter(k => counts.value[k]).map(k => ({ key: k, label: ATTENDANCE_STATUS_META[k]!.label, n: counts.value[k]! }))
])

// Foto selfie absen
const photoOpen = ref(false)
const photoTarget = ref<{ employeeId: string, name: string } | null>(null)
function openPhotos(row: Row) {
  photoTarget.value = { employeeId: row.employeeId, name: row.fullName }
  photoOpen.value = true
}

// Input manual
const open = ref(false)
const form = reactive({ employeeId: '', name: '', workDate: '', clockIn: '', clockOut: '', note: '' })
function openEntry(row: Row) {
  Object.assign(form, { employeeId: row.employeeId, name: row.fullName, workDate: date.value, clockIn: row.record?.clockInTime ?? '', clockOut: row.record?.clockOutTime ?? '', note: '' })
  open.value = true
}
async function saveEntry() {
  try {
    await apiFetch(`/api/app/attendance/employees/${form.employeeId}`, { method: 'POST', body: { workDate: form.workDate, clockIn: form.clockIn || null, clockOut: form.clockOut || null, note: form.note } })
    open.value = false
    toast.success('Absensi disimpan')
    await list.refresh()
  } catch (error) {
    toast.error(error)
  }
}
async function act(c: Correction, decision: 'approved' | 'rejected') {
  if (await decide(`/api/app/attendance/corrections/${c.id}/decide`, decision, { title: `${decision === 'approved' ? 'Setujui' : 'Tolak'} koreksi ${c.employee?.fullName}?`, description: `${formatDateShort(c.workDate)} · masuk ${c.requestedClockIn ?? '–'} · pulang ${c.requestedClockOut ?? '–'}` })) {
    await corrections.refresh()
    await list.refresh()
  }
}
</script>

<template>
  <PagePanel title="Kehadiran">
    <div class="space-y-4">
      <UTabs
        v-model="tab"
        :items="[{ label: 'Harian', value: 'daily', icon: 'i-lucide-calendar-check' }, { label: 'Koreksi', value: 'corrections', icon: 'i-lucide-pencil-line' }]"
        :content="false"
      />

      <template v-if="tab === 'daily'">
        <div class="flex flex-wrap items-center gap-3">
          <UButton
            icon="i-lucide-chevron-left"
            variant="outline"
            color="neutral"
            aria-label="Hari sebelumnya"
            @click="date = shiftDateKey(date, -1)"
          />
          <UInput
            v-model="date"
            type="date"
            :max="localTodayKey()"
            class="w-44"
          />
          <UButton
            icon="i-lucide-chevron-right"
            variant="outline"
            color="neutral"
            aria-label="Hari berikutnya"
            :disabled="date >= localTodayKey()"
            @click="date = shiftDateKey(date, 1)"
          />
          <USelect
            v-model="branchFilter"
            :items="[{ label: 'Semua kantor', value: '__all__' }, ...org.branchOptions.value]"
            class="w-44"
          />
          <UInput
            v-model="list.search.value"
            icon="i-lucide-search"
            placeholder="Cari karyawan…"
            class="w-full sm:w-56"
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="c in chips"
            :key="c.key"
            :label="`${c.label} ${c.n}`"
            size="xs"
            :variant="statusFilter === c.key ? 'solid' : 'soft'"
            :color="statusFilter === c.key ? 'primary' : 'neutral'"
            @click="statusFilter = c.key"
          />
        </div>
        <ListState
          :status="list.status.value"
          :error="list.errorMessage.value"
          :empty="!list.items.value.length"
          empty-text="Tidak ada data untuk filter ini."
          @retry="list.refresh"
        >
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <div class="overflow-x-auto">
              <table class="w-full min-w-[680px] text-sm">
                <thead class="border-b border-default text-left text-xs text-muted">
                  <tr>
                    <th class="px-4 py-2 font-medium">
                      Karyawan
                    </th>
                    <th class="px-4 py-2 font-medium">
                      Jadwal
                    </th>
                    <th class="px-4 py-2 font-medium">
                      Masuk
                    </th>
                    <th class="px-4 py-2 font-medium">
                      Pulang
                    </th>
                    <th class="px-4 py-2 font-medium">
                      Status
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr
                    v-for="r in list.items.value"
                    :key="r.employeeId"
                  >
                    <td class="px-4 py-2">
                      <NuxtLink
                        :to="`/app/employees/${r.employeeId}`"
                        class="font-medium hover:underline"
                      >{{ r.fullName }}</NuxtLink>
                      <p class="text-xs text-muted">
                        {{ r.employeeNumber }} · {{ r.branchName }}
                      </p>
                    </td>
                    <td class="px-4 py-2 text-muted">
                      {{ r.schedule.kind === 'work' ? `${r.schedule.startTime}–${r.schedule.endTime}` : (r.schedule.holidayName ?? 'Libur') }}
                    </td>
                    <td class="px-4 py-2 tabular">
                      {{ r.record?.clockInTime ?? '–' }}
                      <span
                        v-if="r.record?.lateMinutes"
                        class="text-xs text-warning"
                      >+{{ formatMinutes(r.record.lateMinutes) }}</span>
                      <UIcon
                        v-if="r.record?.clockInDistanceMeters != null"
                        name="i-lucide-map-pin"
                        class="size-3 text-muted"
                        :title="`${r.record.clockInDistanceMeters} m dari kantor`"
                      />
                      <UButton
                        v-if="r.record?.hasPhoto"
                        icon="i-lucide-camera"
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        aria-label="Lihat foto absen"
                        @click="openPhotos(r)"
                      />
                    </td>
                    <td class="px-4 py-2 tabular">
                      {{ r.record?.clockOutTime ?? '–' }}
                      <UBadge
                        v-if="r.record?.autoClosed"
                        label="otomatis"
                        size="xs"
                        variant="outline"
                        color="warning"
                      />
                    </td>
                    <td class="px-4 py-2">
                      <StatusBadge
                        :map="ATTENDANCE_STATUS_META"
                        :value="r.status"
                      />
                      <span
                        v-if="r.leave"
                        class="ml-1 text-xs text-muted"
                      >{{ r.leave }}</span>
                    </td>
                    <td class="px-2 py-2 text-right">
                      <UButton
                        v-if="auth.hasAbility('attendance.write') && r.schedule.kind !== 'holiday'"
                        icon="i-lucide-pencil"
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        aria-label="Catat / ubah"
                        @click="openEntry(r)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>
        </ListState>
        <div
          v-if="list.meta.value.pageCount > 1"
          class="flex justify-center"
        >
          <UPagination
            v-model:page="list.page.value"
            :total="list.meta.value.total"
            :items-per-page="list.meta.value.limit"
          />
        </div>
      </template>

      <template v-if="tab === 'corrections'">
        <USelect
          v-model="corrStatus"
          :items="[{ label: 'Menunggu', value: 'pending' }, { label: 'Semua', value: '__all__' }, { label: 'Disetujui', value: 'approved' }, { label: 'Ditolak', value: 'rejected' }]"
          class="w-40"
        />
        <ListState
          :status="corrections.status.value"
          :error="corrections.errorMessage.value"
          :empty="!corrections.items.value.length"
          empty-text="Tidak ada koreksi."
          @retry="corrections.refresh"
        >
          <div class="space-y-3">
            <UCard
              v-for="c in corrections.items.value"
              :key="c.id"
            >
              <div class="flex flex-wrap items-start gap-4 text-sm">
                <div class="min-w-0 flex-1 space-y-1">
                  <p class="flex flex-wrap items-center gap-2">
                    <strong>{{ c.employee?.fullName }}</strong>
                    <span class="font-mono text-xs text-muted">{{ c.code }}</span>
                    <StatusBadge
                      :map="REQUEST_STATUS_META"
                      :value="c.status"
                    />
                  </p>
                  <p>{{ formatDateShort(c.workDate) }} · masuk {{ c.requestedClockIn ?? '–' }} · pulang {{ c.requestedClockOut ?? '–' }}</p>
                  <p class="text-muted">
                    “{{ c.reason }}”
                  </p>
                  <ApprovalTimeline :steps="c.steps" />
                </div>
                <div
                  v-if="c.canDecide"
                  class="flex gap-2"
                >
                  <UButton
                    label="Tolak"
                    size="sm"
                    variant="outline"
                    color="error"
                    @click="act(c, 'rejected')"
                  />
                  <UButton
                    label="Setujui"
                    size="sm"
                    icon="i-lucide-check"
                    @click="act(c, 'approved')"
                  />
                </div>
              </div>
            </UCard>
          </div>
        </ListState>
      </template>
    </div>

    <UModal
      v-model:open="open"
      :title="`Absensi ${form.name}`"
      description="Perubahan atas catatan yang ada disimpan sebagai koreksi beserta nilai lamanya."
    >
      <template #body>
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Tanggal">
            <UInput
              v-model="form.workDate"
              type="date"
              :max="localTodayKey()"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Masuk">
            <UInput
              v-model="form.clockIn"
              type="time"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Pulang">
            <UInput
              v-model="form.clockOut"
              type="time"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Alasan"
            required
            class="sm:col-span-3"
          >
            <UInput
              v-model="form.note"
              class="w-full"
            />
          </UFormField>
        </div>
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
            label="Simpan"
            @click="saveEntry"
          />
        </div>
      </template>
    </UModal>

    <AttendancePhotoDialog
      v-model:open="photoOpen"
      :employee-id="photoTarget?.employeeId ?? null"
      :employee-name="photoTarget?.name"
      :date="date"
    />
  </PagePanel>
</template>
