<script setup lang="ts">
import { WEEKDAY_LABELS } from '#shared/utils/identifiers'

// Shift & jadwal. Shift pertama gratis; shift tambahan dan jadwal harian = fitur shiftScheduling.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Shift & jadwal' })

interface Shift { id: string, name: string, code: string | null, startTime: string, endTime: string, breakMinutes: number, lateToleranceMinutes: number, workingDays: number[], isDefault: boolean, isActive: boolean, employeeCount: number }
interface Day { date: string, kind: string, shiftId: string | null, shiftName: string | null, startTime: string | null, holidayName: string | null }
interface RosterRow { id: string, fullName: string, employeeNumber: string, days: Day[] }

const toast = useApiToast()
const entitlements = useEntitlements()
const { confirm } = useConfirmDialog()
const tab = ref('shifts')
const shifts = ref<Shift[] | null>(null)
const schedulingAvailable = ref(false)
async function loadShifts() {
  try {
    const res = await apiFetch<{ items: Shift[], schedulingAvailable: boolean }>('/api/app/shifts')
    shifts.value = res.items
    schedulingAvailable.value = res.schedulingAvailable
  } catch (error) {
    toast.error(error)
  }
}
onMounted(loadShifts)

const open = ref(false)
const editingId = ref<string | null>(null)
const formError = ref('')
const form = reactive({ name: '', code: '', startTime: '08:00', endTime: '17:00', breakMinutes: 60, lateToleranceMinutes: 0, workingDays: [1, 2, 3, 4, 5] as number[], isDefault: false, isActive: true })
function openForm(row?: Shift) {
  if (!row && (shifts.value?.length ?? 0) >= 1 && !schedulingAvailable.value) return entitlements.upgradeRequired('shiftScheduling')
  editingId.value = row?.id ?? null
  formError.value = ''
  Object.assign(form, row ? { ...row, code: row.code ?? '', workingDays: [...row.workingDays] } : { name: '', code: '', startTime: '08:00', endTime: '17:00', breakMinutes: 60, lateToleranceMinutes: 0, workingDays: [1, 2, 3, 4, 5], isDefault: false, isActive: true })
  open.value = true
}
function toggleDay(d: number, on: boolean) {
  form.workingDays = on ? [...new Set([...form.workingDays, d])].sort() : form.workingDays.filter(x => x !== d)
}
async function save() {
  const body = { name: form.name, code: form.code || null, startTime: form.startTime, endTime: form.endTime, breakMinutes: form.breakMinutes, lateToleranceMinutes: form.lateToleranceMinutes, workingDays: form.workingDays, isDefault: form.isDefault, isActive: form.isActive }
  try {
    if (editingId.value) await apiFetch(`/api/app/shifts/${editingId.value}`, { method: 'PATCH', body })
    else await apiFetch('/api/app/shifts', { method: 'POST', body })
    open.value = false
    toast.success('Shift disimpan')
    await loadShifts()
  } catch (error) {
    if (!entitlements.handlePlanError(error)) formError.value = extractErrorMessage(error)
  }
}
async function remove(s: Shift) {
  if (!await confirm({ title: `Hapus shift ${s.name}?`, confirmLabel: 'Hapus', color: 'error' })) return
  try {
    await apiFetch(`/api/app/shifts/${s.id}`, { method: 'DELETE' })
    await loadShifts()
  } catch (error) {
    toast.error(error)
  }
}

// Jadwal (roster) per minggu
const weekStart = ref((() => {
  const today = localTodayKey()
  const wd = new Date(`${today}T00:00:00Z`).getUTCDay()
  return shiftDateKey(today, -((wd + 6) % 7))
})())
const roster = ref<{ days: string[], items: RosterRow[] } | null>(null)
const selected = ref<Set<string>>(new Set())
const assignShift = ref<string | undefined>()
async function loadRoster() {
  try {
    roster.value = await apiFetch('/api/app/roster', { query: { from: weekStart.value, to: shiftDateKey(weekStart.value, 6) } })
  } catch (error) {
    toast.error(error)
  }
}
watch(tab, (t) => {
  if (t === 'roster') loadRoster()
})
watch(weekStart, loadRoster)
function cellKey(e: string, d: string) {
  return `${e}|${d}`
}
function toggleCell(e: string, d: string) {
  const next = new Set(selected.value)
  const k = cellKey(e, d)
  if (next.has(k)) next.delete(k)
  else next.add(k)
  selected.value = next
}
async function applyAssignment(mode: 'shift' | 'off' | 'reset') {
  if (!schedulingAvailable.value) return entitlements.upgradeRequired('shiftScheduling')
  const cells = [...selected.value].map(k => k.split('|') as [string, string])
  // Kirim per tanggal agar kombinasi karyawan × tanggal tepat seperti yang dipilih.
  const byDate = new Map<string, string[]>()
  for (const [e, d] of cells) byDate.set(d, [...(byDate.get(d) ?? []), e])
  try {
    for (const [d, employeeIds] of byDate) {
      await apiFetch('/api/app/roster/assign', { method: 'POST', body: { employeeIds, dates: [d], shiftId: mode === 'shift' ? assignShift.value : null, reset: mode === 'reset' } })
    }
    selected.value = new Set()
    toast.success('Jadwal diperbarui')
    await loadRoster()
  } catch (error) {
    toast.error(error)
  }
}
const dayNames = (days: number[]) => days.map(d => WEEKDAY_LABELS[d]?.slice(0, 3)).join(', ')
const shiftOptions = computed(() => (shifts.value ?? []).filter(s => s.isActive).map(s => ({ label: `${s.name} ${s.startTime}–${s.endTime}`, value: s.id })))
</script>

<template>
  <PagePanel title="Shift & jadwal">
    <div class="space-y-4">
      <UTabs
        v-model="tab"
        :items="[{ label: 'Shift', value: 'shifts', icon: 'i-lucide-clock-3' }, { label: 'Jadwal mingguan', value: 'roster', icon: 'i-lucide-calendar-range' }]"
        :content="false"
      />

      <template v-if="tab === 'shifts'">
        <UButton
          label="Shift baru"
          icon="i-lucide-plus"
          size="sm"
          :trailing-icon="!schedulingAvailable && (shifts?.length ?? 0) >= 1 ? 'i-lucide-lock' : undefined"
          @click="openForm()"
        />
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <UCard
            v-for="s in shifts ?? []"
            :key="s.id"
            :class="s.isActive ? '' : 'opacity-60'"
          >
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="flex items-center gap-2 font-semibold">
                  {{ s.name }}
                  <UBadge
                    v-if="s.isDefault"
                    label="Default"
                    size="xs"
                  />
                </p>
                <p class="text-2xl font-semibold tabular">
                  {{ s.startTime }}–{{ s.endTime }}
                </p>
                <p class="text-xs text-muted">
                  Istirahat {{ s.breakMinutes }} m · toleransi telat {{ s.lateToleranceMinutes }} m · {{ s.employeeCount }} karyawan
                </p>
                <p class="mt-1 text-xs text-muted">
                  {{ dayNames(s.workingDays) }}
                </p>
              </div>
              <div class="flex">
                <UButton
                  icon="i-lucide-pencil"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  aria-label="Ubah"
                  @click="openForm(s)"
                />
                <UButton
                  v-if="!s.isDefault && !s.employeeCount"
                  icon="i-lucide-trash-2"
                  size="xs"
                  variant="ghost"
                  color="error"
                  aria-label="Hapus"
                  @click="remove(s)"
                />
              </div>
            </div>
          </UCard>
        </div>
      </template>

      <template v-if="tab === 'roster'">
        <FeatureLocked
          v-if="!schedulingAvailable"
          feature="shiftScheduling"
        />
        <template v-else>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              icon="i-lucide-chevron-left"
              variant="outline"
              color="neutral"
              aria-label="Minggu sebelumnya"
              @click="weekStart = shiftDateKey(weekStart, -7)"
            />
            <span class="text-sm font-medium">{{ formatDateShort(weekStart) }} – {{ formatDateShort(shiftDateKey(weekStart, 6)) }}</span>
            <UButton
              icon="i-lucide-chevron-right"
              variant="outline"
              color="neutral"
              aria-label="Minggu berikutnya"
              @click="weekStart = shiftDateKey(weekStart, 7)"
            />
            <div class="ml-auto flex flex-wrap items-center gap-2">
              <span class="text-xs text-muted">{{ selected.size }} sel dipilih</span>
              <USelect
                v-model="assignShift"
                :items="shiftOptions"
                placeholder="Pilih shift"
                class="w-56"
                size="sm"
              />
              <UButton
                label="Terapkan"
                size="sm"
                :disabled="!selected.size || !assignShift"
                @click="applyAssignment('shift')"
              />
              <UButton
                label="Libur"
                size="sm"
                variant="outline"
                :disabled="!selected.size"
                @click="applyAssignment('off')"
              />
              <UButton
                label="Pola bawaan"
                size="sm"
                variant="ghost"
                :disabled="!selected.size"
                @click="applyAssignment('reset')"
              />
            </div>
          </div>
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <div class="overflow-x-auto">
              <table class="w-full min-w-[820px] text-xs">
                <thead>
                  <tr class="border-b border-default">
                    <th class="px-3 py-2 text-left font-medium">
                      Karyawan
                    </th>
                    <th
                      v-for="d in roster?.days ?? []"
                      :key="d"
                      class="px-1 py-2 font-medium"
                    >
                      {{ formatDayShort(d) }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr
                    v-for="row in roster?.items ?? []"
                    :key="row.id"
                  >
                    <td class="px-3 py-1.5 text-sm">
                      {{ row.fullName }}
                    </td>
                    <td
                      v-for="day in row.days"
                      :key="day.date"
                      class="p-1"
                    >
                      <button
                        type="button"
                        class="w-full rounded px-1 py-1.5 text-center"
                        :class="[
                          selected.has(cellKey(row.id, day.date)) ? 'ring-2 ring-primary' : '',
                          day.kind === 'work' ? 'bg-primary/10 text-default' : day.kind === 'holiday' ? 'bg-warning/10 text-warning' : 'bg-elevated text-muted'
                        ]"
                        :disabled="day.kind === 'holiday'"
                        @click="toggleCell(row.id, day.date)"
                      >
                        {{ day.kind === 'work' ? day.startTime : day.kind === 'holiday' ? 'Libur' : 'Off' }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>
          <p class="text-xs text-muted">
            Klik sel untuk memilih, lalu terapkan shift, libur, atau kembalikan ke pola bawaan.
          </p>
        </template>
      </template>
    </div>

    <UModal
      v-model:open="open"
      :title="editingId ? 'Ubah shift' : 'Shift baru'"
    >
      <template #body>
        <form
          id="shift-form"
          class="grid gap-4 sm:grid-cols-2"
          @submit.prevent="save"
        >
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
            class="sm:col-span-2"
          />
          <UFormField
            label="Nama"
            required
          >
            <UInput
              v-model="form.name"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Kode">
            <UInput
              v-model="form.code"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Jam masuk">
            <UInput
              v-model="form.startTime"
              type="time"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Jam pulang"
            hint="Lebih awal = shift malam"
          >
            <UInput
              v-model="form.endTime"
              type="time"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Istirahat (menit)">
            <UInputNumber
              v-model="form.breakMinutes"
              :min="0"
              :max="240"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Toleransi telat (menit)">
            <UInputNumber
              v-model="form.lateToleranceMinutes"
              :min="0"
              :max="120"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Hari kerja"
            class="sm:col-span-2"
          >
            <div class="flex flex-wrap gap-3">
              <UCheckbox
                v-for="(label, d) in WEEKDAY_LABELS"
                :key="d"
                :label="label"
                :model-value="form.workingDays.includes(d)"
                @update:model-value="(v: boolean | 'indeterminate') => toggleDay(d, v === true)"
              />
            </div>
          </UFormField>
          <UCheckbox
            v-model="form.isDefault"
            label="Jadikan default perusahaan"
          />
          <UCheckbox
            v-if="editingId && !form.isDefault"
            v-model="form.isActive"
            label="Aktif"
          />
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
            form="shift-form"
            label="Simpan"
          />
        </div>
      </template>
    </UModal>
  </PagePanel>
</template>
