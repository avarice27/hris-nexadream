<script setup lang="ts">
import { APPROVAL_SUBJECTS, APPROVAL_SUBJECT_LABELS, type ApprovalSubject, type ApproverType } from '#shared/utils/hr'

// Pengaturan HR: alur persetujuan (kustom = fitur customApprovalFlows), absensi geofence/selfie,
// tutup otomatis, risiko JKK, dan kapan slip gaji terlihat karyawan.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Absensi & persetujuan' })

interface HrSettings {
  approvalChains: Partial<Record<ApprovalSubject, ApproverType[]>>
  customApprovalFlows: boolean
  attendanceSelfieRequired: boolean
  attendanceGeofenceEnforced: boolean
  geofenceAvailable: boolean
  autoCloseAfterHours: number
  bpjsJkkRatePercent: number
  payslipVisibleOnApproval: boolean
}
const toast = useApiToast()
const entitlements = useEntitlements()
const data = ref<HrSettings | null>(null)
const chains = reactive<Record<ApprovalSubject, string>>({ leave: 'manager', overtime: 'manager', reimbursement: 'manager', attendance_correction: 'manager' })
const saving = ref(false)
async function load() {
  try {
    data.value = await apiFetch<HrSettings>('/api/app/hr-settings')
    for (const s of APPROVAL_SUBJECTS) chains[s] = (data.value.approvalChains[s] ?? ['manager']).join('+')
  } catch (error) {
    toast.error(error)
  }
}
onMounted(load)
async function save() {
  if (!data.value) return
  saving.value = true
  try {
    data.value = await apiFetch<HrSettings>('/api/app/hr-settings', {
      method: 'PATCH',
      body: {
        ...(data.value.customApprovalFlows ? { approvalChains: Object.fromEntries(APPROVAL_SUBJECTS.map(s => [s, chains[s].split('+')])) } : {}),
        attendanceSelfieRequired: data.value.attendanceSelfieRequired,
        attendanceGeofenceEnforced: data.value.attendanceGeofenceEnforced,
        autoCloseAfterHours: data.value.autoCloseAfterHours,
        bpjsJkkRatePercent: data.value.bpjsJkkRatePercent,
        payslipVisibleOnApproval: data.value.payslipVisibleOnApproval
      }
    })
    toast.success('Pengaturan disimpan')
  } catch (error) {
    toast.error(error)
  } finally {
    saving.value = false
  }
}
const chainOptions = [
  { label: 'Atasan langsung', value: 'manager' },
  { label: 'Atasan → Admin HR', value: 'manager+hr' },
  { label: 'Admin HR saja', value: 'hr' }
]
const jkkOptions = [0.24, 0.54, 0.89, 1.27, 1.74].map(v => ({ label: `${String(v).replace('.', ',')}%`, value: v }))
</script>

<template>
  <PagePanel title="Pengaturan">
    <SettingsNav />
    <USkeleton
      v-if="!data"
      class="h-64 w-full"
    />
    <div
      v-else
      class="max-w-3xl space-y-6"
    >
      <UCard>
        <p class="mb-1 font-semibold">
          Alur persetujuan
        </p>
        <p class="mb-4 text-sm text-muted">
          Bawaan: atasan langsung; bila karyawan tidak punya atasan dengan login, Admin HR yang menyetujui.
        </p>
        <div
          v-if="data.customApprovalFlows"
          class="grid gap-4 sm:grid-cols-2"
        >
          <UFormField
            v-for="s in APPROVAL_SUBJECTS"
            :key="s"
            :label="APPROVAL_SUBJECT_LABELS[s]"
          >
            <USelect
              v-model="chains[s]"
              :items="chainOptions"
              class="w-full"
            />
          </UFormField>
        </div>
        <UButton
          v-else
          label="Alur persetujuan bertingkat"
          icon="i-lucide-lock"
          variant="outline"
          size="sm"
          @click="entitlements.upgradeRequired('customApprovalFlows')"
        />
      </UCard>

      <UCard>
        <p class="mb-4 font-semibold">
          Absensi
        </p>
        <div class="space-y-4">
          <template v-if="data.geofenceAvailable">
            <USwitch
              v-model="data.attendanceGeofenceEnforced"
              label="Wajib absen di area kantor (geofence)"
              description="Atur titik & radius tiap kantor di menu Kantor. Lokasi hanya dibaca saat absen."
            />
            <USwitch
              v-model="data.attendanceSelfieRequired"
              label="Wajib foto selfie saat absen"
              description="Foto disimpan privat dan hanya terlihat Admin HR."
            />
          </template>
          <UButton
            v-else
            label="Absensi geofence / selfie"
            icon="i-lucide-lock"
            variant="outline"
            size="sm"
            @click="entitlements.upgradeRequired('attendanceGeofence')"
          />
          <UFormField
            label="Tutup otomatis absen yang lupa pulang setelah"
            hint="jam setelah jadwal pulang"
          >
            <UInputNumber
              v-model="data.autoCloseAfterHours"
              :min="1"
              :max="24"
              class="w-32"
            />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <p class="mb-4 font-semibold">
          Payroll
        </p>
        <div class="space-y-4">
          <UFormField
            label="Tingkat risiko JKK (BPJS Ketenagakerjaan)"
            hint="Sesuai sertifikat kepesertaan perusahaan"
          >
            <USelect
              v-model="data.bpjsJkkRatePercent"
              :items="jkkOptions"
              class="w-40"
            />
          </UFormField>
          <USwitch
            v-model="data.payslipVisibleOnApproval"
            label="Slip gaji terlihat karyawan begitu payroll disetujui"
            description="Matikan agar slip baru terlihat setelah run ditandai sudah dibayar."
          />
        </div>
      </UCard>

      <UButton
        label="Simpan"
        :loading="saving"
        @click="save"
      />
    </div>
  </PagePanel>
</template>
