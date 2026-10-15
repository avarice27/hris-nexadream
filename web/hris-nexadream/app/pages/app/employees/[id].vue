<script setup lang="ts">
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS, FAMILY_RELATIONSHIPS, FAMILY_RELATIONSHIP_LABELS, GENDER_LABELS, type EmploymentTypeSlug } from '#shared/utils/hr'
import { ATTENDANCE_STATUS_META, EMPLOYMENT_STATUS_META } from '#shared/utils/status'

definePageMeta({ layout: 'tenant' })

interface Detail {
  id: string
  employeeNumber: string
  fullName: string
  email: string | null
  phone: string | null
  status: string
  employmentType: string
  joinDate: string
  contractEndDate: string | null
  probationEndDate: string | null
  endDate: string | null
  terminationReason: string | null
  branchId: string
  branchName: string | null
  departmentId: string | null
  departmentName: string | null
  positionId: string | null
  positionName: string | null
  managerId: string | null
  managerName: string | null
  shiftName: string | null
  gender: string | null
  birthPlace: string | null
  birthDate: string | null
  ptkpStatus: string
  address: string | null
  bpjsKesehatanEnrolled: boolean
  bpjsKetenagakerjaanEnrolled: boolean
  pensionEnrolled: boolean
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  emergencyContactRelation: string | null
  sensitive: Record<string, string | null> | null
  canRevealSensitive: boolean
  login: { email: string, isActive: boolean, role: string } | null
  pendingInvite: { email: string, expiresAt: string } | null
  hasLogin: boolean
}

const route = useRoute()
const auth = useTenantAuth()
const toast = useApiToast()
const { confirm } = useConfirmDialog()
const id = computed(() => String(route.params.id))
const employee = ref<Detail | null>(null)
const errorMessage = ref('')
const canWrite = computed(() => auth.hasAbility('employees.write'))
const tab = ref('overview')

async function load() {
  try {
    employee.value = await apiFetch<Detail>(`/api/app/employees/${id.value}`)
    useHead({ title: employee.value.fullName })
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)

const tabs = computed(() => [
  { label: 'Ringkasan', value: 'overview', icon: 'i-lucide-id-card' },
  { label: 'Riwayat', value: 'history', icon: 'i-lucide-history' },
  ...(auth.hasAbility('employees.sensitive.read') ? [{ label: 'Keluarga', value: 'family', icon: 'i-lucide-users' }] : []),
  ...(auth.hasAbility('payroll.read') ? [{ label: 'Gaji', value: 'salary', icon: 'i-lucide-wallet' }] : []),
  ...(auth.hasAbility('attendance.read') ? [{ label: 'Absensi', value: 'attendance', icon: 'i-lucide-clock' }] : []),
  ...(auth.hasAbility('leave.read') ? [{ label: 'Cuti', value: 'leave', icon: 'i-lucide-plane' }] : []),
  ...(auth.hasAbility('documents.read') ? [{ label: 'Dokumen', value: 'documents', icon: 'i-lucide-folder-lock' }] : [])
])

// --- Data sensitif (buka = diaudit) -----------------------------------------
const revealed = ref<Record<string, string | null>>({})
async function reveal(group: 'identity' | 'bank') {
  try {
    Object.assign(revealed.value, await apiFetch(`/api/app/employees/${id.value}/reveal`, { method: 'POST', body: { group } }))
  } catch (error) {
    toast.error(error)
  }
}
const sens = (key: string) => revealed.value[key] ?? employee.value?.sensitive?.[key] ?? '-'

// --- Edit profil --------------------------------------------------------------
const editOpen = ref(false)
async function onEdited() {
  editOpen.value = false
  revealed.value = {}
  await load()
}

// --- Perubahan kepegawaian (berlaku-tanggal) ---------------------------------
const org = useOrgOptions()
const changeOpen = ref(false)
const changeForm = reactive({ effectiveFrom: '', branchId: '', departmentId: undefined as string | undefined, positionId: undefined as string | undefined, managerId: undefined as string | null | undefined, employmentType: 'permanent', status: 'active', note: '' })
const changeError = ref('')
const saving = ref(false)
function openChange() {
  const e = employee.value!
  org.load().catch(() => {})
  Object.assign(changeForm, { effectiveFrom: localTodayKey(), branchId: e.branchId, departmentId: e.departmentId ?? undefined, positionId: e.positionId ?? undefined, managerId: e.managerId, employmentType: e.employmentType, status: e.status === 'terminated' ? 'active' : e.status, note: '' })
  changeError.value = ''
  changeOpen.value = true
}
async function submitChange() {
  saving.value = true
  changeError.value = ''
  try {
    const res = await apiFetch<{ applied: boolean }>(`/api/app/employees/${id.value}/employment`, { method: 'POST', body: { ...changeForm, departmentId: changeForm.departmentId ?? null, positionId: changeForm.positionId ?? null, managerId: changeForm.managerId ?? null, note: changeForm.note || null } })
    changeOpen.value = false
    toast.success(res.applied ? 'Perubahan diterapkan' : 'Perubahan dijadwalkan', res.applied ? undefined : `Berlaku ${formatDateShort(changeForm.effectiveFrom)}.`)
    await load()
  } catch (error) {
    if (!useEntitlements().handlePlanError(error)) changeError.value = extractErrorMessage(error)
  } finally {
    saving.value = false
  }
}

// --- Berhenti / aktifkan kembali ---------------------------------------------
const terminateOpen = ref(false)
const terminateForm = reactive({ endDate: '', reason: '' })
async function submitTerminate() {
  saving.value = true
  try {
    await apiFetch(`/api/app/employees/${id.value}/terminate`, { method: 'POST', body: terminateForm })
    terminateOpen.value = false
    toast.success('Status karyawan: berhenti')
    await load()
  } catch (error) {
    toast.error(error)
  } finally {
    saving.value = false
  }
}
async function reactivate() {
  if (!await confirm({ title: `Aktifkan kembali ${employee.value?.fullName}?`, description: 'Dihitung ke batas karyawan paket Anda.', confirmLabel: 'Aktifkan' })) return
  try {
    await apiFetch(`/api/app/employees/${id.value}/reactivate`, { method: 'POST' })
    toast.success('Karyawan aktif kembali')
    await load()
  } catch (error) {
    toast.error(error)
  }
}

// --- Akses ESS ---------------------------------------------------------------
async function inviteEss() {
  try {
    const res = await apiFetch<{ linked: boolean }>(`/api/app/employees/${id.value}/ess-invite`, { method: 'POST' })
    toast.success(res.linked ? 'Akun ditautkan' : 'Undangan terkirim', res.linked ? 'Login yang sudah ada kini terhubung ke data karyawan ini.' : `Email undangan dikirim ke ${employee.value?.email}.`)
    await load()
  } catch (error) {
    toast.error(error)
  }
}
async function revokeEss() {
  if (!await confirm({ title: 'Cabut akses layanan mandiri?', description: 'Karyawan tidak bisa lagi masuk untuk absen, cuti, atau melihat slip gaji.', confirmLabel: 'Cabut akses', color: 'error' })) return
  try {
    await apiFetch(`/api/app/employees/${id.value}/ess-access`, { method: 'DELETE' })
    toast.success('Akses dicabut')
    await load()
  } catch (error) {
    toast.error(error)
  }
}

// --- Riwayat -----------------------------------------------------------------
interface HistoryRow { id: string, effectiveFrom: string, branchName: string | null, departmentName: string | null, positionName: string | null, employmentType: string, status: string, note: string | null }
const history = ref<HistoryRow[] | null>(null)
// --- Keluarga ----------------------------------------------------------------
interface FamilyRow { id: string, name: string, relationship: string, birthDate: string | null, nik: string | null, isDependent: boolean }
const family = ref<FamilyRow[] | null>(null)
const familyOpen = ref(false)
const familyForm = reactive({ name: '', relationship: 'spouse', birthDate: '', nik: '', isDependent: false })
// --- Gaji --------------------------------------------------------------------
interface SalaryRow { id: string, effectiveFrom: string, baseSalary: number, items: Array<{ componentId: string, name: string, kind: string, amount: number }>, note: string | null }
const salary = ref<SalaryRow[] | null>(null)
const salaryOpen = ref(false)
const components = ref<Array<{ id: string, name: string, kind: string, isActive: boolean }>>([])
const salaryForm = reactive({ effectiveFrom: '', baseSalary: undefined as number | undefined, items: {} as Record<string, number | undefined>, note: '' })
// --- Absensi -----------------------------------------------------------------
const attMonth = ref(localTodayKey().slice(0, 7))
const calendar = ref<{ days: Array<{ date: string, status: string | null, record: { clockInTime: string | null, clockOutTime: string | null, lateMinutes: number } | null, leave: string | null, schedule: { holidayName: string | null } }>, summary: Record<string, number> } | null>(null)
const attOpen = ref(false)
const attForm = reactive({ workDate: '', clockIn: '', clockOut: '', note: '' })
// --- Cuti --------------------------------------------------------------------
const balances = ref<Array<{ leaveTypeId: string, name: string, tracked: boolean, entitled: number, used: number, pending: number, available: number | null }> | null>(null)
const adjustOpen = ref(false)
const adjustForm = reactive({ leaveTypeId: '', amount: 1, note: '' })
// --- Dokumen -----------------------------------------------------------------
const documents = ref<Array<{ id: string, title: string, categoryLabel: string, expiresAt: string | null, createdAt: string }> | null>(null)

async function loadTab(name: string) {
  try {
    if (name === 'history') history.value = (await apiFetch<{ items: HistoryRow[] }>(`/api/app/employees/${id.value}/history`)).items
    if (name === 'family') family.value = (await apiFetch<{ items: FamilyRow[] }>(`/api/app/employees/${id.value}/family`)).items
    if (name === 'salary') {
      salary.value = (await apiFetch<{ items: SalaryRow[] }>(`/api/app/employees/${id.value}/salary`)).items
      components.value = (await apiFetch<{ items: typeof components.value }>('/api/app/payroll/components')).items
    }
    if (name === 'attendance') {
      const [y, m] = attMonth.value.split('-').map(Number) as [number, number]
      const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
      const today = localTodayKey()
      calendar.value = await apiFetch(`/api/app/attendance/employees/${id.value}`, { query: { from: `${attMonth.value}-01`, to: last < today ? last : today } })
    }
    if (name === 'leave') balances.value = (await apiFetch<{ items: NonNullable<typeof balances.value> }>(`/api/app/leave/balances/${id.value}`)).items
    if (name === 'documents') documents.value = (await apiFetch<{ items: NonNullable<typeof documents.value> }>('/api/app/documents', { query: { employeeId: id.value, limit: 50 } })).items
  } catch (error) {
    toast.error(error)
  }
}
watch(tab, loadTab)
watch(attMonth, () => loadTab('attendance'))

async function saveFamily() {
  try {
    await apiFetch(`/api/app/employees/${id.value}/family`, { method: 'POST', body: { ...familyForm, birthDate: familyForm.birthDate || null, nik: familyForm.nik || null } })
    familyOpen.value = false
    toast.success('Data keluarga ditambahkan')
    await loadTab('family')
  } catch (error) {
    toast.error(error)
  }
}
async function deleteFamily(row: FamilyRow) {
  if (!await confirm({ title: `Hapus ${row.name}?`, confirmLabel: 'Hapus', color: 'error' })) return
  await apiFetch(`/api/app/employees/${id.value}/family/${row.id}`, { method: 'DELETE' }).catch(toast.error)
  await loadTab('family')
}
function openSalary() {
  const current = salary.value?.[0]
  Object.assign(salaryForm, { effectiveFrom: localTodayKey().slice(0, 8) + '01', baseSalary: current?.baseSalary, note: '', items: Object.fromEntries((current?.items ?? []).map(i => [i.componentId, i.amount])) })
  salaryOpen.value = true
}
async function saveSalary() {
  try {
    await apiFetch(`/api/app/employees/${id.value}/salary`, {
      method: 'POST',
      body: { effectiveFrom: salaryForm.effectiveFrom, baseSalary: salaryForm.baseSalary ?? 0, note: salaryForm.note || null, items: Object.entries(salaryForm.items).filter(([, v]) => v && v > 0).map(([componentId, amount]) => ({ componentId, amount })) }
    })
    salaryOpen.value = false
    toast.success('Gaji disimpan', `Berlaku mulai ${formatDateShort(salaryForm.effectiveFrom)}.`)
    await loadTab('salary')
  } catch (error) {
    toast.error(error)
  }
}
function openAttendance(date?: string, inTime?: string | null, outTime?: string | null) {
  Object.assign(attForm, { workDate: date ?? localTodayKey(), clockIn: inTime ?? '', clockOut: outTime ?? '', note: '' })
  attOpen.value = true
}
async function saveAttendance() {
  try {
    await apiFetch(`/api/app/attendance/employees/${id.value}`, { method: 'POST', body: { workDate: attForm.workDate, clockIn: attForm.clockIn || null, clockOut: attForm.clockOut || null, note: attForm.note } })
    attOpen.value = false
    toast.success('Absensi disimpan')
    await loadTab('attendance')
  } catch (error) {
    toast.error(error)
  }
}
async function saveAdjustment() {
  try {
    await apiFetch(`/api/app/leave/balances/${id.value}`, { method: 'POST', body: { ...adjustForm, year: Number(localTodayKey().slice(0, 4)) } })
    adjustOpen.value = false
    toast.success('Saldo disesuaikan')
    await loadTab('leave')
  } catch (error) {
    toast.error(error)
  }
}
const typeOptions = EMPLOYMENT_TYPES.map(t => ({ label: EMPLOYMENT_TYPE_LABELS[t], value: t as string }))
const relationshipOptions = FAMILY_RELATIONSHIPS.map(r => ({ label: FAMILY_RELATIONSHIP_LABELS[r], value: r as string }))
const leaveTypeOptions = computed(() => (balances.value ?? []).filter(b => b.tracked).map(b => ({ label: b.name, value: b.leaveTypeId })))
const statusOptions = [{ label: 'Aktif', value: 'active' }, { label: 'Masa percobaan', value: 'probation' }, { label: 'Sedang cuti panjang', value: 'on_leave' }, { label: 'Nonaktif', value: 'inactive' }]
</script>

<template>
  <PagePanel :title="employee?.fullName ?? 'Karyawan'">
    <template #actions>
      <template v-if="employee && canWrite">
        <UButton
          label="Ubah data"
          icon="i-lucide-pencil"
          variant="outline"
          color="neutral"
          @click="editOpen = true"
        />
        <UDropdownMenu
          :items="[[
            { label: 'Perubahan kepegawaian', icon: 'i-lucide-arrow-right-left', onSelect: openChange, disabled: employee.status === 'terminated' },
            employee.status === 'terminated' || employee.status === 'inactive'
              ? { label: 'Aktifkan kembali', icon: 'i-lucide-rotate-ccw', onSelect: reactivate }
              : { label: 'Berhenti bekerja', icon: 'i-lucide-user-x', color: 'error' as const, onSelect: () => { Object.assign(terminateForm, { endDate: localTodayKey(), reason: '' }); terminateOpen = true } }
          ]]"
        >
          <UButton
            icon="i-lucide-ellipsis-vertical"
            variant="ghost"
            color="neutral"
            aria-label="Aksi lain"
          />
        </UDropdownMenu>
      </template>
    </template>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!employee"
      class="h-64 w-full"
    />
    <div
      v-else
      class="space-y-5"
    >
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <UButton
          to="/app/employees"
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Kembali"
        />
        <span class="font-mono text-muted">{{ employee.employeeNumber }}</span>
        <StatusBadge
          :map="EMPLOYMENT_STATUS_META"
          :value="employee.status"
        />
        <span class="text-muted">{{ employee.positionName ?? '-' }} · {{ employee.departmentName ?? '-' }} · {{ employee.branchName }}</span>
      </div>

      <UTabs
        v-model="tab"
        :items="tabs"
        :content="false"
      />

      <!-- Ringkasan -->
      <div
        v-if="tab === 'overview'"
        class="grid gap-4 lg:grid-cols-3"
      >
        <UCard class="lg:col-span-2">
          <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-xs text-muted">
                Jenis
              </dt><dd>{{ EMPLOYMENT_TYPE_LABELS[employee.employmentType as EmploymentTypeSlug] }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                Mulai bekerja
              </dt><dd>{{ formatDateShort(employee.joinDate) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                Atasan
              </dt><dd>{{ employee.managerName ?? '-' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                Shift
              </dt><dd>{{ employee.shiftName ?? 'Default perusahaan' }}</dd>
            </div>
            <div v-if="employee.probationEndDate">
              <dt class="text-xs text-muted">
                Akhir percobaan
              </dt><dd>{{ formatDateShort(employee.probationEndDate) }}</dd>
            </div>
            <div v-if="employee.contractEndDate">
              <dt class="text-xs text-muted">
                Akhir kontrak
              </dt><dd class="text-warning">
                {{ formatDateShort(employee.contractEndDate) }}
              </dd>
            </div>
            <div v-if="employee.endDate">
              <dt class="text-xs text-muted">
                Berhenti
              </dt><dd>{{ formatDateShort(employee.endDate) }} · {{ employee.terminationReason }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                Email
              </dt><dd>{{ employee.email ?? '-' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                No HP
              </dt><dd>{{ employee.phone ? formatPhone(employee.phone) : '-' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                Jenis kelamin
              </dt><dd>{{ employee.gender ? GENDER_LABELS[employee.gender as 'male'] : '-' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                Lahir
              </dt><dd>{{ [employee.birthPlace, employee.birthDate ? formatDateShort(employee.birthDate) : null].filter(Boolean).join(', ') || '-' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                PTKP
              </dt><dd>{{ employee.ptkpStatus }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                BPJS
              </dt><dd>{{ [employee.bpjsKesehatanEnrolled ? 'Kesehatan' : null, employee.bpjsKetenagakerjaanEnrolled ? 'Ketenagakerjaan' : null, employee.pensionEnrolled && employee.bpjsKetenagakerjaanEnrolled ? 'JP' : null].filter(Boolean).join(', ') || 'Tidak ikut' }}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-xs text-muted">
                Kontak darurat
              </dt><dd>{{ employee.emergencyContactName ? `${employee.emergencyContactName} (${employee.emergencyContactRelation ?? '-'}) ${employee.emergencyContactPhone ?? ''}` : '-' }}</dd>
            </div>
          </dl>
        </UCard>
        <div class="space-y-4">
          <UCard v-if="employee.sensitive">
            <p class="mb-3 flex items-center gap-2 text-sm font-semibold">
              <UIcon
                name="i-lucide-lock"
                class="size-4"
              /> Data pribadi
            </p>
            <dl class="space-y-2 text-sm">
              <div>
                <dt class="text-xs text-muted">
                  NIK
                </dt><dd class="tabular">
                  {{ sens('nik') }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted">
                  NPWP
                </dt><dd class="tabular">
                  {{ sens('npwp') }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted">
                  BPJS Kesehatan
                </dt><dd class="tabular">
                  {{ sens('bpjsKesehatanNumber') }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted">
                  BPJS Ketenagakerjaan
                </dt><dd class="tabular">
                  {{ sens('bpjsKetenagakerjaanNumber') }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted">
                  Rekening
                </dt><dd class="tabular">
                  {{ employee.sensitive.bankName ?? '' }} {{ sens('bankAccountNumber') }}
                </dd>
              </div>
            </dl>
            <div
              v-if="employee.canRevealSensitive"
              class="mt-3 flex flex-wrap gap-2"
            >
              <UButton
                v-if="!revealed.nik"
                label="Buka identitas"
                icon="i-lucide-eye"
                size="xs"
                variant="outline"
                @click="reveal('identity')"
              />
              <UButton
                v-if="!revealed.bankAccountNumber"
                label="Buka rekening"
                icon="i-lucide-eye"
                size="xs"
                variant="outline"
                @click="reveal('bank')"
              />
            </div>
            <p class="mt-2 text-xs text-muted">
              Setiap pembukaan data dicatat di log aktivitas.
            </p>
          </UCard>
          <UCard>
            <p class="mb-2 flex items-center gap-2 text-sm font-semibold">
              <UIcon
                name="i-lucide-smartphone"
                class="size-4"
              /> Layanan mandiri
            </p>
            <p
              v-if="employee.login"
              class="text-sm"
            >
              Terhubung ke <strong>{{ employee.login.email }}</strong>
              <UBadge
                v-if="!employee.login.isActive"
                label="Nonaktif"
                size="xs"
                color="neutral"
                class="ml-1"
              />
            </p>
            <p
              v-else-if="employee.pendingInvite"
              class="text-sm text-muted"
            >
              Undangan dikirim ke {{ employee.pendingInvite.email }}, berlaku s.d. {{ formatDateId(employee.pendingInvite.expiresAt) }}.
            </p>
            <p
              v-else
              class="text-sm text-muted"
            >
              Belum punya akses. Undang agar karyawan bisa absen, mengajukan cuti, dan melihat slip gaji dari ponsel.
            </p>
            <div
              v-if="canWrite && employee.status !== 'terminated'"
              class="mt-3 flex gap-2"
            >
              <UButton
                v-if="!employee.login?.isActive"
                :label="employee.pendingInvite ? 'Kirim ulang undangan' : 'Undang'"
                icon="i-lucide-send"
                size="xs"
                :disabled="!employee.email"
                @click="inviteEss"
              />
              <UButton
                v-if="employee.login?.isActive || employee.pendingInvite"
                label="Cabut akses"
                size="xs"
                variant="ghost"
                color="error"
                @click="revokeEss"
              />
            </div>
            <p
              v-if="!employee.email && canWrite"
              class="mt-1 text-xs text-warning"
            >
              Isi email karyawan untuk mengundang.
            </p>
          </UCard>
        </div>
      </div>

      <!-- Riwayat -->
      <UCard
        v-if="tab === 'history'"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <USkeleton
          v-if="!history"
          class="h-32 w-full"
        />
        <ul
          v-else
          class="divide-y divide-default"
        >
          <li
            v-for="h in history"
            :key="h.id"
            class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
          >
            <span class="w-28 font-medium">{{ formatDateShort(h.effectiveFrom) }}</span>
            <span class="flex-1">{{ h.positionName ?? '-' }} · {{ h.departmentName ?? '-' }} · {{ h.branchName }} · {{ EMPLOYMENT_TYPE_LABELS[h.employmentType as EmploymentTypeSlug] }}<span
              v-if="h.note"
              class="text-muted"
            > — {{ h.note }}</span></span>
            <StatusBadge
              :map="EMPLOYMENT_STATUS_META"
              :value="h.status"
            />
          </li>
        </ul>
      </UCard>

      <!-- Keluarga -->
      <div
        v-if="tab === 'family'"
        class="space-y-3"
      >
        <UButton
          v-if="canWrite"
          label="Tambah anggota keluarga"
          icon="i-lucide-plus"
          size="sm"
          @click="() => { Object.assign(familyForm, { name: '', relationship: 'spouse', birthDate: '', nik: '', isDependent: false }); familyOpen = true }"
        />
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <p
            v-if="family && !family.length"
            class="p-6 text-center text-sm text-muted"
          >
            Belum ada data keluarga.
          </p>
          <ul class="divide-y divide-default">
            <li
              v-for="f in family ?? []"
              :key="f.id"
              class="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <span class="flex-1"><strong>{{ f.name }}</strong> · {{ FAMILY_RELATIONSHIP_LABELS[f.relationship as 'spouse'] }}<span v-if="f.birthDate"> · {{ formatDateShort(f.birthDate) }}</span><span
                v-if="f.nik"
                class="tabular text-muted"
              > · {{ f.nik }}</span></span>
              <UBadge
                v-if="f.isDependent"
                label="Tanggungan"
                size="xs"
                variant="subtle"
              />
              <UButton
                v-if="canWrite"
                icon="i-lucide-trash-2"
                size="xs"
                variant="ghost"
                color="error"
                aria-label="Hapus"
                @click="deleteFamily(f)"
              />
            </li>
          </ul>
        </UCard>
      </div>

      <!-- Gaji -->
      <div
        v-if="tab === 'salary'"
        class="space-y-3"
      >
        <UButton
          v-if="auth.hasAbility('payroll.write')"
          label="Atur gaji baru"
          icon="i-lucide-plus"
          size="sm"
          @click="openSalary"
        />
        <UCard
          v-for="(s, idx) in salary ?? []"
          :key="s.id"
        >
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-semibold">Berlaku {{ formatDateShort(s.effectiveFrom) }}</span>
            <UBadge
              v-if="idx === 0"
              label="Terbaru"
              size="xs"
            />
            <span class="ml-auto text-lg font-semibold tabular">{{ formatIDR(s.baseSalary) }}</span>
          </div>
          <ul class="mt-2 space-y-1 text-sm text-muted">
            <li
              v-for="i in s.items"
              :key="i.componentId"
              class="flex justify-between"
            >
              <span>{{ i.name }} <span v-if="i.kind === 'deduction'">(potongan)</span></span><span class="tabular">{{ formatIDR(i.amount) }}</span>
            </li>
          </ul>
          <p
            v-if="s.note"
            class="mt-2 text-xs text-muted"
          >
            {{ s.note }}
          </p>
        </UCard>
        <p
          v-if="salary && !salary.length"
          class="text-sm text-muted"
        >
          Gaji belum diatur — karyawan ini akan muncul dengan peringatan di payroll.
        </p>
      </div>

      <!-- Absensi -->
      <div
        v-if="tab === 'attendance'"
        class="space-y-3"
      >
        <div class="flex flex-wrap items-center gap-3">
          <UInput
            v-model="attMonth"
            type="month"
            class="w-44"
          />
          <UButton
            v-if="auth.hasAbility('attendance.write')"
            label="Catat absen manual"
            icon="i-lucide-plus"
            size="sm"
            variant="outline"
            @click="openAttendance()"
          />
          <span
            v-if="calendar"
            class="text-sm text-muted"
          >Hadir {{ calendar.summary.presentDays }}/{{ calendar.summary.scheduledDays }} · terlambat {{ calendar.summary.lateDays }} · cuti {{ calendar.summary.leaveDays }} · alpa {{ calendar.summary.absentDays }}</span>
        </div>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="d in [...(calendar?.days ?? [])].reverse()"
              :key="d.date"
              class="flex items-center gap-3 px-4 py-2 text-sm"
            >
              <span class="w-28 font-medium">{{ formatDayShort(d.date) }}</span>
              <span class="flex-1 tabular text-muted">{{ d.record?.clockInTime ? `${d.record.clockInTime} – ${d.record.clockOutTime ?? '…'}` : (d.leave ?? d.schedule.holidayName ?? '') }}</span>
              <StatusBadge
                v-if="d.status"
                :map="ATTENDANCE_STATUS_META"
                :value="d.status"
              />
              <UButton
                v-if="auth.hasAbility('attendance.write') && d.status !== 'off' && d.status !== 'holiday'"
                icon="i-lucide-pencil"
                size="xs"
                variant="ghost"
                color="neutral"
                aria-label="Ubah"
                @click="openAttendance(d.date, d.record?.clockInTime, d.record?.clockOutTime)"
              />
            </li>
          </ul>
        </UCard>
      </div>

      <!-- Cuti -->
      <div
        v-if="tab === 'leave'"
        class="space-y-3"
      >
        <UButton
          v-if="auth.hasAbility('leave.write')"
          label="Sesuaikan saldo"
          icon="i-lucide-sliders-horizontal"
          size="sm"
          variant="outline"
          @click="() => { Object.assign(adjustForm, { leaveTypeId: balances?.find(b => b.tracked)?.leaveTypeId ?? '', amount: 1, note: '' }); adjustOpen = true }"
        />
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UCard
            v-for="b in (balances ?? []).filter(x => x.tracked)"
            :key="b.leaveTypeId"
            :ui="{ body: 'p-4 sm:p-4' }"
          >
            <p class="text-sm text-muted">
              {{ b.name }}
            </p>
            <p class="text-2xl font-semibold tabular">
              {{ b.available }} <span class="text-sm font-normal text-muted">/ {{ b.entitled }}</span>
            </p>
            <p class="text-xs text-muted">
              Terpakai {{ b.used }} · menunggu {{ b.pending }}
            </p>
          </UCard>
        </div>
      </div>

      <!-- Dokumen -->
      <UCard
        v-if="tab === 'documents'"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <div class="flex justify-end p-3">
          <UButton
            to="/app/documents"
            label="Kelola di Dokumen"
            size="xs"
            variant="ghost"
            trailing-icon="i-lucide-arrow-right"
          />
        </div>
        <p
          v-if="documents && !documents.length"
          class="p-6 text-center text-sm text-muted"
        >
          Belum ada dokumen.
        </p>
        <ul class="divide-y divide-default">
          <li
            v-for="d in documents ?? []"
            :key="d.id"
            class="flex items-center gap-3 px-4 py-3 text-sm"
          >
            <span class="flex-1"><strong>{{ d.title }}</strong> · {{ d.categoryLabel }}<span
              v-if="d.expiresAt"
              class="text-muted"
            > · s.d. {{ formatDateShort(d.expiresAt) }}</span></span>
            <UButton
              label="Buka"
              size="xs"
              variant="outline"
              @click="openSignedFile(`/api/app/documents/${d.id}/url`).catch(toast.error)"
            />
          </li>
        </ul>
      </UCard>
    </div>

    <USlideover
      v-model:open="editOpen"
      title="Ubah data karyawan"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <EmployeeForm
          v-if="employee && editOpen"
          mode="edit"
          :initial="employee as unknown as Record<string, unknown>"
          @saved="onEdited"
          @cancel="editOpen = false"
        />
      </template>
    </USlideover>

    <UModal
      v-model:open="changeOpen"
      title="Perubahan kepegawaian"
      description="Tersimpan sebagai riwayat. Tanggal di masa depan diterapkan otomatis pada harinya."
    >
      <template #body>
        <form
          id="change-form"
          class="grid gap-4 sm:grid-cols-2"
          @submit.prevent="submitChange"
        >
          <UAlert
            v-if="changeError"
            color="error"
            variant="subtle"
            :title="changeError"
            class="sm:col-span-2"
          />
          <UFormField
            label="Berlaku mulai"
            required
          >
            <UInput
              v-model="changeForm.effectiveFrom"
              type="date"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Status">
            <USelect
              v-model="changeForm.status"
              :items="statusOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Kantor">
            <USelect
              v-model="changeForm.branchId"
              :items="org.branchOptions.value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Jenis">
            <USelect
              v-model="changeForm.employmentType"
              :items="typeOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Departemen">
            <USelect
              v-model="changeForm.departmentId"
              :items="org.departments.value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Jabatan">
            <USelect
              v-model="changeForm.positionId"
              :items="org.positions.value"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Atasan langsung"
            class="sm:col-span-2"
          >
            <EmployeePicker
              v-model="changeForm.managerId"
              :initial-label="employee?.managerName"
              :exclude-id="employee?.id"
            />
          </UFormField>
          <UFormField
            label="Catatan"
            class="sm:col-span-2"
          >
            <UInput
              v-model="changeForm.note"
              class="w-full"
              placeholder="Mis. promosi, mutasi"
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
            @click="changeOpen = false"
          />
          <UButton
            type="submit"
            form="change-form"
            label="Simpan perubahan"
            :loading="saving"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="terminateOpen"
      title="Karyawan berhenti bekerja"
      description="Login layanan mandiri ikut dinonaktifkan. Bawahan langsung akan disetujui Admin HR."
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="Tanggal terakhir bekerja">
            <UInput
              v-model="terminateForm.endDate"
              type="date"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Alasan">
            <UInput
              v-model="terminateForm.reason"
              class="w-full"
              placeholder="Mengundurkan diri, kontrak selesai, …"
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
            @click="terminateOpen = false"
          />
          <UButton
            label="Simpan"
            color="error"
            :loading="saving"
            @click="submitTerminate"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="familyOpen"
      title="Tambah anggota keluarga"
    >
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="Nama"
            class="sm:col-span-2"
          >
            <UInput
              v-model="familyForm.name"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Hubungan">
            <USelect
              v-model="familyForm.relationship"
              :items="relationshipOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Tanggal lahir">
            <UInput
              v-model="familyForm.birthDate"
              type="date"
              class="w-full"
            />
          </UFormField>
          <UFormField label="NIK">
            <UInput
              v-model="familyForm.nik"
              inputmode="numeric"
              class="w-full"
              autocomplete="off"
            />
          </UFormField>
          <UCheckbox
            v-model="familyForm.isDependent"
            label="Tanggungan (PTKP/BPJS)"
            class="self-end"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Batal"
            variant="ghost"
            color="neutral"
            @click="familyOpen = false"
          />
          <UButton
            label="Simpan"
            @click="saveFamily"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="salaryOpen"
      title="Atur gaji"
      description="Tersimpan sebagai riwayat berlaku-tanggal. Payroll memakai gaji yang berlaku di akhir periode."
    >
      <template #body>
        <div class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Berlaku mulai">
              <UInput
                v-model="salaryForm.effectiveFrom"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Gaji pokok">
              <UInputNumber
                v-model="salaryForm.baseSalary"
                :min="0"
                :step="50000"
                :format-options="{ style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }"
                locale="id-ID"
                class="w-full"
              />
            </UFormField>
          </div>
          <div
            v-for="c in components.filter(x => x.isActive)"
            :key="c.id"
            class="flex items-center gap-3"
          >
            <span class="flex-1 text-sm">{{ c.name }}<span
              v-if="c.kind === 'deduction'"
              class="text-muted"
            > (potongan)</span></span>
            <UInputNumber
              v-model="salaryForm.items[c.id]"
              :min="0"
              :step="10000"
              :format-options="{ style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }"
              locale="id-ID"
              class="w-48"
            />
          </div>
          <UFormField label="Catatan">
            <UInput
              v-model="salaryForm.note"
              class="w-full"
              placeholder="Mis. kenaikan tahunan"
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
            @click="salaryOpen = false"
          />
          <UButton
            label="Simpan gaji"
            @click="saveSalary"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="attOpen"
      title="Catat / ubah absensi"
      description="Perubahan atas catatan yang ada disimpan sebagai koreksi beserta nilai lamanya."
    >
      <template #body>
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Tanggal">
            <UInput
              v-model="attForm.workDate"
              type="date"
              :max="localTodayKey()"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Masuk">
            <UInput
              v-model="attForm.clockIn"
              type="time"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Pulang">
            <UInput
              v-model="attForm.clockOut"
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
              v-model="attForm.note"
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
            @click="attOpen = false"
          />
          <UButton
            label="Simpan"
            @click="saveAttendance"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="adjustOpen"
      title="Sesuaikan saldo cuti"
      description="Tercatat di buku besar cuti (tambah atau kurangi)."
    >
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Jenis cuti">
            <USelect
              v-model="adjustForm.leaveTypeId"
              :items="leaveTypeOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Jumlah hari"
            hint="Negatif untuk mengurangi"
          >
            <UInputNumber
              v-model="adjustForm.amount"
              :step="0.5"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Alasan"
            class="sm:col-span-2"
          >
            <UInput
              v-model="adjustForm.note"
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
            @click="adjustOpen = false"
          />
          <UButton
            label="Simpan"
            @click="saveAdjustment"
          />
        </div>
      </template>
    </UModal>
  </PagePanel>
</template>
