<script setup lang="ts">
// Beranda layanan mandiri: absen, saldo cuti, slip terakhir, pengajuan menunggu, libur terdekat.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Beranda' })

interface Home {
  linked: boolean
  employee?: { fullName: string, employeeNumber: string }
  // Bentuk sama dengan GET /api/app/me/attendance/today (diteruskan apa adanya ke kartu absen).
  attendance?: Record<string, unknown> | null
  annualLeave?: { name: string, available: number | null, entitled: number, used: number } | null
  latestPayslip?: { id: string, periodLabel: string, net: number } | null
  pendingRequests?: number
  upcomingHolidays?: Array<{ date: string, name: string }>
}

const auth = useTenantAuth()
const firstName = computed(() => auth.profile.value?.name.split(' ')[0] ?? '')
const home = ref<Home | null>(null)
const errorMessage = ref('')
const showAmount = ref(false)

async function load() {
  try {
    home.value = await apiFetch<Home>('/api/app/me/home')
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-highlighted">
        Halo, {{ firstName }}
      </h1>
      <p class="text-muted">
        {{ auth.tenant.value?.name }}<span v-if="home?.employee"> · {{ home.employee.employeeNumber }}</span>
      </p>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!home"
      class="h-48 w-full"
    />
    <UAlert
      v-else-if="!home.linked"
      color="info"
      variant="subtle"
      icon="i-lucide-link"
      title="Akun Anda belum terhubung ke data karyawan"
      description="Minta Admin HR menautkan akun ini ke data karyawan Anda (menu Karyawan → Akses layanan mandiri)."
    />
    <template v-else>
      <AttendanceClockCard
        v-if="home.attendance"
        :initial="home.attendance as never"
      />

      <div class="grid gap-4 sm:grid-cols-3">
        <UCard v-if="home.annualLeave">
          <p class="text-sm text-muted">
            Sisa {{ home.annualLeave.name.toLowerCase() }}
          </p>
          <p class="mt-1 text-3xl font-semibold tabular text-highlighted">
            {{ home.annualLeave.available ?? '–' }} <span class="text-base font-normal text-muted">hari</span>
          </p>
          <UButton
            to="/app/me/leave"
            label="Ajukan cuti"
            variant="link"
            class="mt-2 px-0"
            trailing-icon="i-lucide-arrow-right"
          />
        </UCard>
        <UCard v-if="auth.hasAbility('payslips.read.own')">
          <p class="text-sm text-muted">
            Slip gaji terakhir
          </p>
          <template v-if="home.latestPayslip">
            <p class="mt-1 font-medium">
              {{ home.latestPayslip.periodLabel }}
            </p>
            <button
              type="button"
              class="text-2xl font-semibold tabular text-highlighted"
              :aria-label="showAmount ? 'Sembunyikan nominal' : 'Tampilkan nominal'"
              @click="showAmount = !showAmount"
            >
              {{ showAmount ? formatIDR(home.latestPayslip.net) : 'Rp ••••••' }}
              <UIcon
                :name="showAmount ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                class="size-4 text-muted"
              />
            </button>
            <div>
              <UButton
                :to="`/app/me/payslips/${home.latestPayslip.id}`"
                label="Lihat slip"
                variant="link"
                class="mt-1 px-0"
                trailing-icon="i-lucide-arrow-right"
              />
            </div>
          </template>
          <p
            v-else
            class="mt-1 text-sm text-muted"
          >
            Belum ada slip gaji.
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Pengajuan menunggu
          </p>
          <p class="mt-1 text-3xl font-semibold tabular text-highlighted">
            {{ home.pendingRequests ?? 0 }}
          </p>
          <UButton
            to="/app/me/requests"
            label="Lembur & reimbursement"
            variant="link"
            class="mt-2 px-0"
            trailing-icon="i-lucide-arrow-right"
          />
        </UCard>
      </div>

      <UCard v-if="home.upcomingHolidays?.length">
        <p class="mb-2 text-sm font-medium">
          Libur terdekat
        </p>
        <ul class="space-y-1 text-sm">
          <li
            v-for="h in home.upcomingHolidays"
            :key="h.date"
            class="flex justify-between gap-3"
          >
            <span>{{ h.name }}</span><span class="text-muted">{{ formatDateShort(h.date) }}</span>
          </li>
        </ul>
      </UCard>
    </template>
  </div>
</template>
