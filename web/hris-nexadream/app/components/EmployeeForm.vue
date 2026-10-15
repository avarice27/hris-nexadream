<script setup lang="ts">
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS, GENDER_LABELS, MARITAL_LABELS, RELIGION_LABELS, type GENDERS, type MARITAL_STATUSES, type RELIGIONS } from '#shared/utils/hr'
import { PTKP_LABELS, PTKP_STATUSES } from '#shared/utils/payroll-rules'

// Form karyawan. mode 'create' = semua field; mode 'edit' = profil, kontak, pajak/BPJS, data sensitif
// (kantor/departemen/jabatan/atasan/status diubah lewat "Perubahan kepegawaian" yang berlaku-tanggal).
// Field sensitif kosong saat edit = tidak berubah; isi untuk mengganti.
const props = defineProps<{ mode: 'create' | 'edit', initial?: Record<string, unknown> | null }>()
const emit = defineEmits<{ saved: [{ id: string }], cancel: [] }>()
const org = useOrgOptions()
const toast = useApiToast()
const saving = ref(false)
const formError = ref('')
onMounted(() => org.load().catch(toast.error))

const i = props.initial ?? {}
const s = (k: string) => (i[k] as string | null | undefined) ?? ''
const form = reactive({
  fullName: s('fullName'),
  employeeNumber: s('employeeNumber'),
  email: s('email'),
  phone: s('phone'),
  gender: ((i.gender as string | null) ?? undefined) as (typeof GENDERS)[number] | undefined,
  birthPlace: s('birthPlace'),
  birthDate: s('birthDate'),
  religion: ((i.religion as string | null) ?? undefined) as (typeof RELIGIONS)[number] | undefined,
  maritalStatus: ((i.maritalStatus as string | null) ?? undefined) as (typeof MARITAL_STATUSES)[number] | undefined,
  ptkpStatus: (i.ptkpStatus as string) ?? 'TK0',
  address: s('address'),
  joinDate: s('joinDate') || localTodayKey(),
  probationEndDate: s('probationEndDate'),
  contractEndDate: s('contractEndDate'),
  employmentType: (i.employmentType as string) ?? 'permanent',
  status: (i.status as string) === 'probation' ? 'probation' : 'active',
  branchId: (i.branchId as string) ?? useActiveBranch().activeBranchId.value ?? '',
  departmentId: (i.departmentId as string | null) ?? undefined,
  positionId: (i.positionId as string | null) ?? undefined,
  managerId: (i.managerId as string | null) ?? undefined,
  shiftId: (i.shiftId as string | null) ?? undefined,
  bpjsKesehatanEnrolled: (i.bpjsKesehatanEnrolled as boolean) ?? true,
  bpjsKetenagakerjaanEnrolled: (i.bpjsKetenagakerjaanEnrolled as boolean) ?? true,
  pensionEnrolled: (i.pensionEnrolled as boolean) ?? true,
  emergencyContactName: s('emergencyContactName'),
  emergencyContactPhone: s('emergencyContactPhone'),
  emergencyContactRelation: s('emergencyContactRelation'),
  nik: '',
  npwp: '',
  bpjsKesehatanNumber: '',
  bpjsKetenagakerjaanNumber: '',
  bankName: s('bankName'),
  bankAccountNumber: '',
  bankAccountName: s('bankAccountName')
})
const masked = (i.sensitive ?? {}) as Record<string, string | null>
const opts = <T extends string>(map: Record<T, string>) => (Object.keys(map) as T[]).map(k => ({ label: map[k], value: k }))
const nn = (v: string | undefined | null) => (v ? v : null)
const typeOptions = EMPLOYMENT_TYPES.map(t => ({ label: EMPLOYMENT_TYPE_LABELS[t], value: t as string }))
const ptkpOptions = PTKP_STATUSES.map(p => ({ label: PTKP_LABELS[p], value: p as string }))

function payload() {
  const sensitive = Object.fromEntries((['nik', 'npwp', 'bpjsKesehatanNumber', 'bpjsKetenagakerjaanNumber', 'bankAccountNumber'] as const)
    .filter(k => props.mode === 'create' ? form[k] : form[k] !== '')
    .map(k => [k, form[k]]))
  const common = {
    fullName: form.fullName, email: nn(form.email), phone: nn(form.phone), gender: form.gender ?? null, birthPlace: nn(form.birthPlace),
    birthDate: nn(form.birthDate), religion: form.religion ?? null, maritalStatus: form.maritalStatus ?? null, ptkpStatus: form.ptkpStatus,
    address: nn(form.address), probationEndDate: nn(form.probationEndDate), contractEndDate: nn(form.contractEndDate), shiftId: form.shiftId ?? null,
    bpjsKesehatanEnrolled: form.bpjsKesehatanEnrolled, bpjsKetenagakerjaanEnrolled: form.bpjsKetenagakerjaanEnrolled, pensionEnrolled: form.pensionEnrolled,
    emergencyContactName: nn(form.emergencyContactName), emergencyContactPhone: nn(form.emergencyContactPhone), emergencyContactRelation: nn(form.emergencyContactRelation),
    bankName: nn(form.bankName), bankAccountName: nn(form.bankAccountName), ...sensitive
  }
  if (props.mode === 'edit') return common
  return {
    ...common, employeeNumber: form.employeeNumber || undefined, joinDate: form.joinDate, employmentType: form.employmentType, status: form.status,
    branchId: form.branchId, departmentId: form.departmentId ?? null, positionId: form.positionId ?? null, managerId: form.managerId ?? null
  }
}

async function submit() {
  saving.value = true
  formError.value = ''
  try {
    const result = props.mode === 'create'
      ? await apiFetch<{ id: string }>('/api/app/employees', { method: 'POST', body: payload() })
      : (await apiFetch(`/api/app/employees/${i.id}`, { method: 'PATCH', body: payload() }), { id: String(i.id) })
    toast.success(props.mode === 'create' ? 'Karyawan ditambahkan' : 'Data karyawan disimpan')
    emit('saved', result)
  } catch (error) {
    if (useEntitlements().handlePlanError(error)) return
    formError.value = extractErrorMessage(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form
    class="space-y-6"
    @submit.prevent="submit"
  >
    <UAlert
      v-if="formError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="formError"
    />
    <section class="space-y-4">
      <h3 class="text-sm font-semibold text-muted">
        Identitas
      </h3>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          label="Nama lengkap"
          required
          class="sm:col-span-2"
        >
          <UInput
            v-model="form.fullName"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="mode === 'create'"
          label="NIP"
          hint="Kosongkan untuk otomatis"
        >
          <UInput
            v-model="form.employeeNumber"
            class="w-full"
            placeholder="EMP-0001"
          />
        </UFormField>
        <UFormField label="Jenis kelamin">
          <USelect
            v-model="form.gender"
            :items="opts(GENDER_LABELS)"
            class="w-full"
            placeholder="Pilih"
          />
        </UFormField>
        <UFormField label="Tempat lahir">
          <UInput
            v-model="form.birthPlace"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Tanggal lahir">
          <UInput
            v-model="form.birthDate"
            type="date"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Agama">
          <USelect
            v-model="form.religion"
            :items="opts(RELIGION_LABELS)"
            class="w-full"
            placeholder="Pilih"
          />
        </UFormField>
        <UFormField label="Status perkawinan">
          <USelect
            v-model="form.maritalStatus"
            :items="opts(MARITAL_LABELS)"
            class="w-full"
            placeholder="Pilih"
          />
        </UFormField>
        <UFormField label="Email">
          <UInput
            v-model="form.email"
            type="email"
            class="w-full"
          />
        </UFormField>
        <UFormField label="No HP">
          <UInput
            v-model="form.phone"
            type="tel"
            class="w-full"
            placeholder="08xx"
          />
        </UFormField>
        <UFormField
          label="Alamat"
          class="sm:col-span-2"
        >
          <UTextarea
            v-model="form.address"
            :rows="2"
            class="w-full"
          />
        </UFormField>
      </div>
    </section>

    <section
      v-if="mode === 'create'"
      class="space-y-4"
    >
      <h3 class="text-sm font-semibold text-muted">
        Kepegawaian
      </h3>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          label="Tanggal masuk"
          required
        >
          <UInput
            v-model="form.joinDate"
            type="date"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Jenis">
          <USelect
            v-model="form.employmentType"
            :items="typeOptions"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Kantor"
          required
        >
          <USelect
            v-model="form.branchId"
            :items="org.branchOptions.value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Status">
          <USelect
            v-model="form.status"
            :items="[{ label: 'Aktif', value: 'active' }, { label: 'Masa percobaan', value: 'probation' }]"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Departemen">
          <USelect
            v-model="form.departmentId"
            :items="org.departments.value"
            class="w-full"
            placeholder="Pilih"
          />
        </UFormField>
        <UFormField label="Jabatan">
          <USelect
            v-model="form.positionId"
            :items="org.positions.value"
            class="w-full"
            placeholder="Pilih"
          />
        </UFormField>
        <UFormField
          label="Atasan langsung"
          hint="Penyetuju cuti & lembur"
          class="sm:col-span-2"
        >
          <EmployeePicker v-model="form.managerId" />
        </UFormField>
      </div>
    </section>

    <section class="space-y-4">
      <h3 class="text-sm font-semibold text-muted">
        Jadwal, kontrak & pajak
      </h3>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          label="Shift bawaan"
          hint="Kosong = shift default"
        >
          <USelect
            v-model="form.shiftId"
            :items="org.shifts.value"
            class="w-full"
            placeholder="Shift default"
          />
        </UFormField>
        <UFormField label="Status PTKP">
          <USelect
            v-model="form.ptkpStatus"
            :items="ptkpOptions"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Akhir masa percobaan">
          <UInput
            v-model="form.probationEndDate"
            type="date"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Akhir kontrak (PKWT)">
          <UInput
            v-model="form.contractEndDate"
            type="date"
            class="w-full"
          />
        </UFormField>
        <div class="flex flex-wrap gap-4 sm:col-span-2">
          <UCheckbox
            v-model="form.bpjsKesehatanEnrolled"
            label="Peserta BPJS Kesehatan"
          />
          <UCheckbox
            v-model="form.bpjsKetenagakerjaanEnrolled"
            label="Peserta BPJS Ketenagakerjaan"
          />
          <UCheckbox
            v-model="form.pensionEnrolled"
            label="Ikut Jaminan Pensiun"
            :disabled="!form.bpjsKetenagakerjaanEnrolled"
          />
        </div>
      </div>
    </section>

    <section class="space-y-4">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-muted">
        <UIcon
          name="i-lucide-lock"
          class="size-4"
        /> Data pribadi (terenkripsi)
      </h3>
      <p
        v-if="mode === 'edit'"
        class="text-xs text-muted"
      >
        Kosongkan untuk tidak mengubah. Nilai tersimpan ditampilkan tersamar.
      </p>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="NIK (16 digit)">
          <UInput
            v-model="form.nik"
            inputmode="numeric"
            class="w-full"
            :placeholder="masked.nik ?? ''"
            autocomplete="off"
          />
        </UFormField>
        <UFormField label="NPWP">
          <UInput
            v-model="form.npwp"
            inputmode="numeric"
            class="w-full"
            :placeholder="masked.npwp ?? ''"
            autocomplete="off"
          />
        </UFormField>
        <UFormField label="No BPJS Kesehatan">
          <UInput
            v-model="form.bpjsKesehatanNumber"
            inputmode="numeric"
            class="w-full"
            :placeholder="masked.bpjsKesehatanNumber ?? ''"
            autocomplete="off"
          />
        </UFormField>
        <UFormField label="No BPJS Ketenagakerjaan">
          <UInput
            v-model="form.bpjsKetenagakerjaanNumber"
            inputmode="numeric"
            class="w-full"
            :placeholder="masked.bpjsKetenagakerjaanNumber ?? ''"
            autocomplete="off"
          />
        </UFormField>
        <UFormField label="Bank">
          <UInput
            v-model="form.bankName"
            class="w-full"
            placeholder="BCA, Mandiri, BRI…"
          />
        </UFormField>
        <UFormField label="No rekening">
          <UInput
            v-model="form.bankAccountNumber"
            inputmode="numeric"
            class="w-full"
            :placeholder="masked.bankAccountNumber ?? ''"
            autocomplete="off"
          />
        </UFormField>
        <UFormField
          label="Nama pemilik rekening"
          class="sm:col-span-2"
        >
          <UInput
            v-model="form.bankAccountName"
            class="w-full"
          />
        </UFormField>
      </div>
    </section>

    <section class="space-y-4">
      <h3 class="text-sm font-semibold text-muted">
        Kontak darurat
      </h3>
      <div class="grid gap-4 sm:grid-cols-3">
        <UFormField label="Nama">
          <UInput
            v-model="form.emergencyContactName"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Hubungan">
          <UInput
            v-model="form.emergencyContactRelation"
            class="w-full"
          />
        </UFormField>
        <UFormField label="No HP">
          <UInput
            v-model="form.emergencyContactPhone"
            class="w-full"
          />
        </UFormField>
      </div>
    </section>

    <div class="flex justify-end gap-2">
      <UButton
        label="Batal"
        variant="ghost"
        color="neutral"
        @click="emit('cancel')"
      />
      <UButton
        type="submit"
        :label="mode === 'create' ? 'Tambah karyawan' : 'Simpan'"
        :loading="saving"
      />
    </div>
  </form>
</template>
