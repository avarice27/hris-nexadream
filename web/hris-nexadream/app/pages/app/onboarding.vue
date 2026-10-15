<script setup lang="ts">
import type { StepperItem } from '@nuxt/ui'
import { TIMEZONE_OPTIONS } from '#shared/utils/settings'
import { isValidIndonesianPhone } from '#shared/utils/phone'
import { isValidNpwp } from '#shared/utils/identifiers'

// Wizard onboarding — wajib sekali, target selesai < 3 menit.
definePageMeta({ layout: 'onboarding' })
useHead({ title: 'Siapkan perusahaan' })

interface OnboardingState {
  companyName: string
  legalName: string
  industry: string
  needsPhone: boolean
  hasNpwp: boolean
  branchName: string
  branchAddress: string
  timezone: string
  workingDays: number[]
  workStartTime: string
  workEndTime: string
  breakMinutes: number
  annualLeaveDays: number
}

const auth = useTenantAuth()
const toast = useApiToast()

const loading = ref(true)
const loadError = ref('')
const submitting = ref(false)
const step = ref(0)
const fieldError = ref('')

const form = reactive({
  companyName: '',
  legalName: '',
  industry: '',
  phone: '',
  npwp: '',
  branchName: '',
  branchAddress: '',
  timezone: 'Asia/Jakarta',
  workingDays: [1, 2, 3, 4, 5] as number[],
  workStartTime: '08:00',
  workEndTime: '17:00',
  breakMinutes: 60,
  annualLeaveDays: 12,
  acceptDataConsent: false
})
const needsPhone = ref(false)
const hasNpwp = ref(false)

onMounted(async () => {
  try {
    const state = await apiFetch<OnboardingState>('/api/app/onboarding')
    Object.assign(form, {
      companyName: state.companyName,
      legalName: state.legalName,
      industry: state.industry,
      branchName: state.branchName,
      branchAddress: state.branchAddress,
      timezone: state.timezone,
      workingDays: state.workingDays,
      workStartTime: state.workStartTime,
      workEndTime: state.workEndTime,
      breakMinutes: state.breakMinutes,
      annualLeaveDays: state.annualLeaveDays
    })
    needsPhone.value = state.needsPhone
    hasNpwp.value = state.hasNpwp
  } catch (error) {
    loadError.value = extractErrorMessage(error)
  } finally {
    loading.value = false
  }
})

const steps: StepperItem[] = [
  { title: 'Perusahaan', icon: 'i-lucide-building-2' },
  { title: 'Kantor', icon: 'i-lucide-map-pin' },
  { title: 'Jam kerja', icon: 'i-lucide-clock' },
  { title: 'Cuti', icon: 'i-lucide-plane' },
  { title: 'Persetujuan', icon: 'i-lucide-shield-check' }
]

/** Validasi ringan per langkah; server tetap memvalidasi semuanya. */
function validateStep(): string {
  if (step.value === 0) {
    if (form.companyName.trim().length < 2) return 'Nama perusahaan minimal 2 karakter.'
    if (needsPhone.value && !isValidIndonesianPhone(form.phone)) return 'Masukkan nomor HP Indonesia yang valid.'
    if (form.npwp && !isValidNpwp(form.npwp)) return 'NPWP harus 15 atau 16 digit.'
  }
  if (step.value === 1 && form.branchName.trim().length < 2) return 'Nama kantor minimal 2 karakter.'
  if (step.value === 2) {
    if (!form.workingDays.length) return 'Pilih minimal satu hari kerja.'
    if (form.workStartTime >= form.workEndTime) return 'Jam selesai harus setelah jam mulai.'
  }
  if (step.value === 3 && (form.annualLeaveDays < 0 || form.annualLeaveDays > 60)) return 'Jatah cuti tahunan 0–60 hari.'
  return ''
}

function next() {
  fieldError.value = validateStep()
  if (!fieldError.value) step.value++
}

async function submit() {
  fieldError.value = form.acceptDataConsent ? '' : 'Anda perlu menyetujui pemrosesan data pribadi karyawan.'
  if (fieldError.value) return
  submitting.value = true
  try {
    await apiFetch('/api/app/onboarding', {
      method: 'POST',
      body: {
        ...form,
        phone: needsPhone.value ? form.phone : undefined,
        npwp: form.npwp || undefined,
        legalName: form.legalName || undefined,
        industry: form.industry || undefined,
        branchAddress: form.branchAddress || undefined
      }
    })
    await auth.fetchProfile()
    useActiveBranch().reset()
    toast.success('Perusahaan siap digunakan', 'Langkah berikutnya: undang tim HR dan tambahkan karyawan.')
    await navigateTo('/app/dashboard')
  } catch (error) {
    fieldError.value = extractErrorMessage(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">
        Siapkan perusahaan Anda
      </h1>
      <p class="text-muted">
        Lima langkah singkat. Semua bisa diubah lagi di Pengaturan.
      </p>
    </div>

    <USkeleton
      v-if="loading"
      class="h-80 w-full"
    />
    <UAlert
      v-else-if="loadError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="loadError"
    />

    <UCard
      v-else
      :ui="{ body: 'p-5 sm:p-8' }"
    >
      <UStepper
        v-model="step"
        :items="steps"
        size="sm"
        class="mb-8"
        disabled
      />

      <div class="space-y-4">
        <template v-if="step === 0">
          <UFormField
            label="Nama perusahaan"
            required
          >
            <UInput
              v-model="form.companyName"
              class="w-full"
              autocomplete="organization"
            />
          </UFormField>
          <UFormField
            label="Nama badan hukum"
            help="Contoh: PT Maju Bersama Indonesia. Dicetak pada slip gaji."
          >
            <UInput
              v-model="form.legalName"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Bidang usaha">
            <UInput
              v-model="form.industry"
              placeholder="Ritel, manufaktur, jasa…"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="needsPhone"
            label="Nomor HP Anda"
            required
          >
            <UInput
              v-model="form.phone"
              type="tel"
              placeholder="0812 3456 7890"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="NPWP perusahaan (opsional)"
            :help="hasNpwp ? 'NPWP sudah tersimpan. Isi hanya untuk menggantinya.' : 'Boleh dilewati sekarang; diperlukan nanti untuk PPh 21. Disimpan terenkripsi.'"
          >
            <UInput
              v-model="form.npwp"
              inputmode="numeric"
              placeholder="15 atau 16 digit"
              class="w-full"
            />
          </UFormField>
        </template>

        <template v-else-if="step === 1">
          <UFormField
            label="Nama kantor pertama"
            required
          >
            <UInput
              v-model="form.branchName"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Alamat">
            <UTextarea
              v-model="form.branchAddress"
              :rows="2"
              autoresize
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Zona waktu kantor"
            help="Dipakai untuk menentukan tanggal absensi karyawan di kantor ini."
          >
            <USelect
              v-model="form.timezone"
              :items="TIMEZONE_OPTIONS"
              class="w-full"
            />
          </UFormField>
        </template>

        <template v-else-if="step === 2">
          <UFormField label="Hari kerja">
            <WorkingDaysPicker v-model="form.workingDays" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField label="Jam masuk">
              <UInput
                v-model="form.workStartTime"
                type="time"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Jam pulang">
              <UInput
                v-model="form.workEndTime"
                type="time"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Istirahat (menit)">
              <UInputNumber
                v-model="form.breakMinutes"
                :min="0"
                :max="240"
                :step="15"
                class="w-full"
              />
            </UFormField>
          </div>
        </template>

        <template v-else-if="step === 3">
          <UFormField
            label="Jatah cuti tahunan (hari)"
            help="UU Ketenagakerjaan: minimal 12 hari setelah 12 bulan bekerja."
          >
            <UInputNumber
              v-model="form.annualLeaveDays"
              :min="0"
              :max="60"
              class="w-full sm:w-40"
            />
          </UFormField>
          <UAlert
            color="info"
            variant="subtle"
            icon="i-lucide-info"
            title="Jenis cuti lain"
            description="Kami siapkan cuti sakit, melahirkan, menikah, dan duka sebagai bawaan. Anda bisa mengubahnya di Pengaturan."
          />
        </template>

        <template v-else>
          <p class="text-sm text-muted">
            Data karyawan (identitas, gaji, rekening) adalah data pribadi menurut UU Pelindungan Data Pribadi.
            Perusahaan Anda adalah pengendali datanya; HRIS Nexadream memprosesnya atas nama Anda,
            menyimpannya terenkripsi, dan mencatat setiap akses ke data sensitif.
          </p>
          <UCheckbox
            v-model="form.acceptDataConsent"
            label="Saya berwenang mewakili perusahaan dan menyetujui pemrosesan data pribadi karyawan sesuai Kebijakan Privasi."
          />
        </template>

        <UAlert
          v-if="fieldError"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="fieldError"
        />

        <div class="flex justify-between gap-2 pt-2">
          <UButton
            v-if="step > 0"
            label="Kembali"
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-left"
            @click="step--"
          />
          <span v-else />
          <UButton
            v-if="step < steps.length - 1"
            label="Lanjut"
            trailing-icon="i-lucide-arrow-right"
            @click="next"
          />
          <UButton
            v-else
            label="Selesai"
            icon="i-lucide-check"
            :loading="submitting"
            @click="submit"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
