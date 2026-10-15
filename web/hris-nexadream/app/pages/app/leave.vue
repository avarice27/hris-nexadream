<script setup lang="ts">
import { REQUEST_STATUS_META } from '#shared/utils/status'
import type { ApprovalStepView } from '~/types/hr'

// Cuti (konsol): pengajuan + persetujuan, kalender tim, dan jenis cuti.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Cuti' })

interface Request { id: string, code: string, leaveTypeName: string, employee: { id: string, fullName: string, employeeNumber: string }, startDate: string, endDate: string, halfDay: boolean, days: number, reason: string | null, hasAttachment: boolean, status: string, steps: ApprovalStepView[], canDecide: boolean }
interface LeaveType { id: string, code: string, name: string, annualDays: number | null, isPaid: boolean, requiresAttachment: boolean, eligibleAfterMonths: number, allowHalfDay: boolean, genderRestriction: 'male' | 'female' | null, isActive: boolean }

const auth = useTenantAuth()
const toast = useApiToast()
const entitlements = useEntitlements()
const { decide } = useDecision()
const { confirm } = useConfirmDialog()
const tab = ref('requests')
const status = ref<string | undefined>('pending')
const list = useServerList<Request>('/api/app/leave/requests', { filters: { status } })
const canWrite = computed(() => auth.hasAbility('leave.write'))

async function act(r: Request, decision: 'approved' | 'rejected') {
  if (await decide(`/api/app/leave/requests/${r.id}/decide`, decision, { title: `${decision === 'approved' ? 'Setujui' : 'Tolak'} cuti ${r.employee.fullName}?`, description: `${r.leaveTypeName} · ${r.days} hari (${formatDateShort(r.startDate)} – ${formatDateShort(r.endDate)})` })) await list.refresh()
}
async function cancel(r: Request) {
  if (!await confirm({ title: `Batalkan ${r.code}?`, description: r.status === 'approved' ? 'Saldo cuti dikembalikan ke karyawan.' : undefined, confirmLabel: 'Batalkan cuti', color: 'error' })) return
  try {
    await apiFetch(`/api/app/leave/requests/${r.id}/cancel`, { method: 'POST' })
    toast.success('Cuti dibatalkan')
    await list.refresh()
  } catch (error) {
    toast.error(error)
  }
}
const expanded = ref<string | null>(null)

// Ajukan atas nama karyawan (Admin HR)
const types = ref<LeaveType[]>([])
async function loadTypes() {
  types.value = (await apiFetch<{ items: LeaveType[] }>('/api/app/leave/types')).items
}
onMounted(() => loadTypes().catch(() => {}))
const createOpen = ref(false)
const createForm = reactive({ employeeId: undefined as string | null | undefined, leaveTypeId: '', startDate: '', endDate: '', halfDay: false, reason: '' })
const createError = ref('')
function openCreate() {
  Object.assign(createForm, { employeeId: undefined, leaveTypeId: types.value.find(t => t.isActive)?.id ?? '', startDate: localTodayKey(), endDate: localTodayKey(), halfDay: false, reason: '' })
  createError.value = ''
  createOpen.value = true
}
async function submitCreate() {
  createError.value = ''
  try {
    await apiFetch('/api/app/leave/requests', { method: 'POST', body: { ...createForm, reason: createForm.reason || null } })
    createOpen.value = false
    toast.success('Cuti diajukan atas nama karyawan')
    await list.refresh()
  } catch (error) {
    if (!entitlements.handlePlanError(error)) createError.value = extractErrorMessage(error)
  }
}
const typeOptions = computed(() => types.value.filter(t => t.isActive).map(t => ({ label: t.name, value: t.id })))

// Kalender bulan
const month = ref(localTodayKey().slice(0, 7))
const calendar = ref<{ from: string, to: string, items: Array<Omit<Request, 'steps' | 'canDecide'>> } | null>(null)
async function loadCalendar() {
  try {
    calendar.value = await apiFetch('/api/app/leave/calendar', { query: { month: month.value } })
  } catch (error) {
    toast.error(error)
  }
}
watch(tab, (t) => {
  if (t === 'calendar') loadCalendar()
  if (t === 'types') loadTypes()
})
watch(month, loadCalendar)
const calendarDays = computed(() => {
  if (!calendar.value) return []
  const days: Array<{ date: string, people: Array<{ name: string, type: string, pending: boolean }> }> = []
  for (let d = calendar.value.from; d <= calendar.value.to; d = shiftDateKey(d, 1)) {
    days.push({ date: d, people: calendar.value.items.filter(r => r.startDate <= d && r.endDate >= d).map(r => ({ name: r.employee.fullName, type: r.leaveTypeName, pending: r.status === 'pending' })) })
  }
  return days.filter(d => d.people.length)
})

// Jenis cuti
const typeOpen = ref(false)
const editingType = ref<string | null>(null)
const typeForm = reactive({ code: '', name: '', annualDays: 12 as number | null, unlimited: false, isPaid: true, requiresAttachment: false, eligibleAfterMonths: 0, allowHalfDay: true, genderRestriction: null as 'male' | 'female' | null, isActive: true })
const typeError = ref('')
function openType(t?: LeaveType) {
  editingType.value = t?.id ?? null
  typeError.value = ''
  Object.assign(typeForm, t ? { ...t, unlimited: t.annualDays === null } : { code: '', name: '', annualDays: 12, unlimited: false, isPaid: true, requiresAttachment: false, eligibleAfterMonths: 0, allowHalfDay: true, genderRestriction: null, isActive: true })
  typeOpen.value = true
}
async function saveType() {
  const body = { code: typeForm.code, name: typeForm.name, annualDays: typeForm.unlimited ? null : typeForm.annualDays, isPaid: typeForm.isPaid, requiresAttachment: typeForm.requiresAttachment, eligibleAfterMonths: typeForm.eligibleAfterMonths, allowHalfDay: typeForm.allowHalfDay, genderRestriction: typeForm.genderRestriction, isActive: typeForm.isActive }
  try {
    if (editingType.value) await apiFetch(`/api/app/leave/types/${editingType.value}`, { method: 'PATCH', body })
    else await apiFetch('/api/app/leave/types', { method: 'POST', body })
    typeOpen.value = false
    toast.success('Jenis cuti disimpan')
    await loadTypes()
  } catch (error) {
    if (!entitlements.handlePlanError(error)) typeError.value = extractErrorMessage(error)
  }
}
const genderOptions = [{ label: 'Semua', value: null }, { label: 'Perempuan', value: 'female' }, { label: 'Laki-laki', value: 'male' }]
</script>

<template>
  <PagePanel title="Cuti">
    <template #actions>
      <UButton
        v-if="canWrite"
        label="Ajukan atas nama"
        icon="i-lucide-plus"
        @click="openCreate"
      />
    </template>
    <div class="space-y-4">
      <UTabs
        v-model="tab"
        :items="[{ label: 'Pengajuan', value: 'requests', icon: 'i-lucide-list' }, { label: 'Kalender', value: 'calendar', icon: 'i-lucide-calendar' }, ...(canWrite ? [{ label: 'Jenis cuti', value: 'types', icon: 'i-lucide-tags' }] : [])]"
        :content="false"
      />

      <template v-if="tab === 'requests'">
        <div class="flex flex-wrap gap-3">
          <UInput
            v-model="list.search.value"
            icon="i-lucide-search"
            placeholder="Cari nama atau kode…"
            class="w-full sm:w-64"
          />
          <USelect
            v-model="status"
            :items="[{ label: 'Menunggu', value: 'pending' }, { label: 'Semua', value: '__all__' }, { label: 'Disetujui', value: 'approved' }, { label: 'Ditolak', value: 'rejected' }, { label: 'Dibatalkan', value: 'cancelled' }]"
            class="w-40"
          />
        </div>
        <ListState
          :status="list.status.value"
          :error="list.errorMessage.value"
          :empty="!list.items.value.length"
          empty-text="Tidak ada pengajuan cuti."
          @retry="list.refresh"
        >
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <ul class="divide-y divide-default">
              <li
                v-for="r in list.items.value"
                :key="r.id"
                class="px-4 py-3 text-sm"
              >
                <div class="flex flex-wrap items-center gap-3">
                  <div class="min-w-0 flex-1">
                    <p>
                      <NuxtLink
                        :to="`/app/employees/${r.employee.id}`"
                        class="font-medium hover:underline"
                      >{{ r.employee.fullName }}</NuxtLink>
                      <span class="text-muted"> · {{ r.leaveTypeName }} · {{ r.days }} hari</span>
                    </p>
                    <p class="text-xs text-muted">
                      {{ r.code }} · {{ formatDateShort(r.startDate) }}<span v-if="r.endDate !== r.startDate"> – {{ formatDateShort(r.endDate) }}</span><span v-if="r.halfDay"> (½ hari)</span>
                    </p>
                  </div>
                  <StatusBadge
                    :map="REQUEST_STATUS_META"
                    :value="r.status"
                  />
                  <template v-if="r.canDecide">
                    <UButton
                      label="Tolak"
                      size="xs"
                      variant="outline"
                      color="error"
                      @click="act(r, 'rejected')"
                    />
                    <UButton
                      label="Setujui"
                      size="xs"
                      icon="i-lucide-check"
                      @click="act(r, 'approved')"
                    />
                  </template>
                  <UButton
                    :icon="expanded === r.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    aria-label="Rincian"
                    @click="expanded = expanded === r.id ? null : r.id"
                  />
                </div>
                <div
                  v-if="expanded === r.id"
                  class="mt-3 space-y-3 rounded-md bg-elevated/50 p-3"
                >
                  <p
                    v-if="r.reason"
                    class="text-muted"
                  >
                    “{{ r.reason }}”
                  </p>
                  <ApprovalTimeline :steps="r.steps" />
                  <div class="flex gap-2">
                    <UButton
                      v-if="r.hasAttachment"
                      label="Lampiran"
                      icon="i-lucide-paperclip"
                      size="xs"
                      variant="outline"
                      @click="openSignedFile(`/api/app/leave/requests/${r.id}/attachment`).catch(toast.error)"
                    />
                    <UButton
                      v-if="canWrite && (r.status === 'pending' || r.status === 'approved')"
                      label="Batalkan cuti"
                      size="xs"
                      variant="ghost"
                      color="error"
                      @click="cancel(r)"
                    />
                  </div>
                </div>
              </li>
            </ul>
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

      <template v-if="tab === 'calendar'">
        <UInput
          v-model="month"
          type="month"
          class="w-44"
        />
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <p
            v-if="calendar && !calendarDays.length"
            class="p-6 text-center text-sm text-muted"
          >
            Tidak ada yang cuti bulan ini.
          </p>
          <ul class="divide-y divide-default">
            <li
              v-for="d in calendarDays"
              :key="d.date"
              class="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm"
            >
              <span class="w-28 font-medium">{{ formatDayShort(d.date) }}</span>
              <UBadge
                v-for="p in d.people"
                :key="p.name"
                :label="`${p.name} · ${p.type}`"
                :color="p.pending ? 'warning' : 'info'"
                :variant="p.pending ? 'outline' : 'subtle'"
                size="sm"
              />
            </li>
          </ul>
        </UCard>
        <p class="text-xs text-muted">
          Garis tepi kuning = masih menunggu persetujuan.
        </p>
      </template>

      <template v-if="tab === 'types'">
        <UButton
          label="Jenis cuti baru"
          icon="i-lucide-plus"
          size="sm"
          @click="openType()"
        />
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="t in types"
              :key="t.id"
              class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
              :class="t.isActive ? '' : 'opacity-60'"
            >
              <span class="font-mono text-xs text-muted">{{ t.code }}</span>
              <span class="flex-1 font-medium">{{ t.name }}</span>
              <span class="text-muted">{{ t.annualDays === null ? 'Tanpa saldo' : `${t.annualDays} hari/tahun` }}<span v-if="t.eligibleAfterMonths"> · setelah {{ t.eligibleAfterMonths }} bln</span><span v-if="!t.isPaid"> · tanpa upah</span><span v-if="t.requiresAttachment"> · perlu lampiran</span></span>
              <UButton
                icon="i-lucide-pencil"
                size="xs"
                variant="ghost"
                color="neutral"
                aria-label="Ubah"
                @click="openType(t)"
              />
            </li>
          </ul>
        </UCard>
      </template>
    </div>

    <UModal
      v-model:open="createOpen"
      title="Ajukan cuti atas nama karyawan"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="createError"
            color="error"
            variant="subtle"
            :title="createError"
          />
          <UFormField label="Karyawan">
            <EmployeePicker v-model="createForm.employeeId" />
          </UFormField>
          <UFormField label="Jenis cuti">
            <USelect
              v-model="createForm.leaveTypeId"
              :items="typeOptions"
              class="w-full"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Mulai">
              <UInput
                v-model="createForm.startDate"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Selesai">
              <UInput
                v-model="createForm.endDate"
                type="date"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField label="Alasan">
            <UInput
              v-model="createForm.reason"
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
            @click="createOpen = false"
          />
          <UButton
            label="Ajukan"
            @click="submitCreate"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="typeOpen"
      :title="editingType ? 'Ubah jenis cuti' : 'Jenis cuti baru'"
    >
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UAlert
            v-if="typeError"
            color="error"
            variant="subtle"
            :title="typeError"
            class="sm:col-span-2"
          />
          <UFormField label="Kode">
            <UInput
              v-model="typeForm.code"
              :disabled="!!editingType"
              class="w-full font-mono"
            />
          </UFormField>
          <UFormField label="Nama">
            <UInput
              v-model="typeForm.name"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Jatah per tahun (hari)">
            <UInputNumber
              v-model="typeForm.annualDays"
              :min="0.5"
              :step="0.5"
              :disabled="typeForm.unlimited"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Berlaku setelah (bulan kerja)">
            <UInputNumber
              v-model="typeForm.eligibleAfterMonths"
              :min="0"
              :max="120"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Khusus">
            <USelect
              v-model="typeForm.genderRestriction"
              :items="genderOptions"
              class="w-full"
            />
          </UFormField>
          <div class="flex flex-col gap-2">
            <UCheckbox
              v-model="typeForm.unlimited"
              label="Tanpa saldo (mis. sakit)"
            />
            <UCheckbox
              v-model="typeForm.isPaid"
              label="Dibayar"
            />
            <UCheckbox
              v-model="typeForm.requiresAttachment"
              label="Wajib lampiran"
            />
            <UCheckbox
              v-model="typeForm.allowHalfDay"
              label="Boleh setengah hari"
            />
            <UCheckbox
              v-if="editingType"
              v-model="typeForm.isActive"
              label="Aktif"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Batal"
            variant="ghost"
            color="neutral"
            @click="typeOpen = false"
          />
          <UButton
            label="Simpan"
            @click="saveType"
          />
        </div>
      </template>
    </UModal>
  </PagePanel>
</template>
