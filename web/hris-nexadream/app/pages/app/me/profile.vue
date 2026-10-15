<script setup lang="ts">
import { EMPLOYMENT_TYPE_LABELS, type EmploymentTypeSlug } from '#shared/utils/hr'
import { EMPLOYMENT_STATUS_META } from '#shared/utils/status'

// Profil karyawan (ESS): data kepegawaian hanya-baca (perubahan lewat Admin HR) + akun login.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Profil' })

interface Mine {
  employeeNumber: string
  fullName: string
  status: string
  employmentType: string
  joinDate: string
  branchName: string | null
  departmentName: string | null
  positionName: string | null
  managerName: string | null
  ptkpStatus: string
  sensitive: { nik: string | null, npwp: string | null, bpjsKesehatanNumber: string | null, bpjsKetenagakerjaanNumber: string | null, bankName: string | null, bankAccountNumber: string | null }
}
const mine = ref<Mine | null>(null)
const notLinked = ref(false)
onMounted(async () => {
  try {
    mine.value = await apiFetch<Mine>('/api/app/me/employee')
  } catch {
    notLinked.value = true
  }
})
const rows = computed(() => mine.value
  ? [
      ['NIP', mine.value.employeeNumber],
      ['Jabatan', mine.value.positionName ?? '-'],
      ['Departemen', mine.value.departmentName ?? '-'],
      ['Kantor', mine.value.branchName ?? '-'],
      ['Atasan', mine.value.managerName ?? '-'],
      ['Jenis', EMPLOYMENT_TYPE_LABELS[mine.value.employmentType as EmploymentTypeSlug] ?? mine.value.employmentType],
      ['Mulai bekerja', formatDateShort(mine.value.joinDate)],
      ['Status PTKP', mine.value.ptkpStatus],
      ['NIK', mine.value.sensitive.nik ?? '-'],
      ['NPWP', mine.value.sensitive.npwp ?? '-'],
      ['BPJS Kesehatan', mine.value.sensitive.bpjsKesehatanNumber ?? '-'],
      ['BPJS Ketenagakerjaan', mine.value.sensitive.bpjsKetenagakerjaanNumber ?? '-'],
      ['Rekening', mine.value.sensitive.bankName ? `${mine.value.sensitive.bankName} ${mine.value.sensitive.bankAccountNumber ?? ''}` : '-']
    ]
  : [])
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold text-highlighted">
      Profil
    </h1>
    <UCard v-if="mine">
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <p class="text-lg font-semibold">
          {{ mine.fullName }}
        </p>
        <StatusBadge
          :map="EMPLOYMENT_STATUS_META"
          :value="mine.status"
        />
      </div>
      <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div
          v-for="[label, value] in rows"
          :key="label"
        >
          <dt class="text-xs text-muted">
            {{ label }}
          </dt>
          <dd class="tabular">
            {{ value }}
          </dd>
        </div>
      </dl>
      <p class="mt-4 text-xs text-muted">
        Data kepegawaian dan nomor identitas dikelola Admin HR. Hubungi mereka bila ada yang keliru.
      </p>
    </UCard>
    <UAlert
      v-else-if="notLinked"
      color="info"
      variant="subtle"
      title="Akun ini belum terhubung ke data karyawan."
    />
    <div>
      <h2 class="mb-2 font-semibold">
        Akun
      </h2>
      <UCard>
        <ProfileForm />
      </UCard>
      <UButton
        to="/app/change-password"
        label="Ubah kata sandi"
        icon="i-lucide-key-round"
        variant="link"
        class="mt-2 px-0"
      />
    </div>
  </div>
</template>
