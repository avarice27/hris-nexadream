<script setup lang="ts">
import { TENANT_ROLE_PRESETS } from '#shared/utils/tenant-abilities'
import { PAYROLL_STATUS_META } from '#shared/utils/status'

definePageMeta({ layout: 'tenant' })
useHead({ title: 'Dashboard' })

interface Dashboard {
  today: string
  employees: { count: number, limit: number } | null
  pendingApprovals: number
  attendance: Record<string, number> | null
  onLeaveToday: number | null
  contractsExpiring: number | null
  lastPayroll: { id: string, code: string, periodLabel: string, status: string } | null
  setup: { hasEmployees: boolean, hasSalary: boolean, hasEssLogin: boolean } | null
}

const auth = useTenantAuth()
const role = computed(() => auth.profile.value?.tenantRole)
const firstName = computed(() => auth.profile.value?.name.split(' ')[0] ?? '')
const data = ref<Dashboard | null>(null)
const errorMessage = ref('')
onMounted(async () => {
  try {
    data.value = await apiFetch<Dashboard>('/api/app/dashboard')
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
})
const present = computed(() => (data.value?.attendance?.present ?? 0) + (data.value?.attendance?.late ?? 0))
const expected = computed(() => {
  const a = data.value?.attendance ?? {}
  return (a.present ?? 0) + (a.late ?? 0) + (a.absent ?? 0) + (a.not_yet ?? 0)
})
const setupSteps = computed(() => data.value?.setup
  ? [
      { done: data.value.setup.hasEmployees, label: 'Tambahkan atau impor karyawan', to: '/app/employees' },
      { done: data.value.setup.hasSalary, label: 'Isi gaji pokok karyawan', to: '/app/employees' },
      { done: data.value.setup.hasEssLogin, label: 'Undang karyawan ke layanan mandiri', to: '/app/employees' }
    ]
  : [])
const setupDone = computed(() => setupSteps.value.every(s => s.done))
</script>

<template>
  <PagePanel title="Dashboard">
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-semibold">
          Halo, {{ firstName }}
        </h2>
        <p class="text-muted">
          {{ auth.tenant.value?.name }}
          <span v-if="role"> · {{ TENANT_ROLE_PRESETS[role].label }}</span>
          <span v-if="data"> · {{ formatDayShort(data.today) }}</span>
        </p>
      </div>
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        :title="errorMessage"
      />
      <USkeleton
        v-else-if="!data"
        class="h-40 w-full"
      />
      <template v-else>
        <UCard v-if="data.setup && !setupDone">
          <p class="mb-3 font-semibold">
            Langkah awal
          </p>
          <ul class="space-y-2 text-sm">
            <li
              v-for="s in setupSteps"
              :key="s.label"
              class="flex items-center gap-2"
            >
              <UIcon
                :name="s.done ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                class="size-4"
                :class="s.done ? 'text-success' : 'text-dimmed'"
              />
              <NuxtLink
                :to="s.to"
                :class="s.done ? 'text-muted line-through' : 'hover:underline'"
              >{{ s.label }}</NuxtLink>
            </li>
          </ul>
        </UCard>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <NuxtLink
            v-if="data.employees"
            to="/app/employees"
          >
            <UCard class="h-full hover:ring-primary/40">
              <p class="text-sm text-muted">Karyawan aktif</p>
              <p class="mt-1 text-3xl font-semibold tabular">{{ data.employees.count }}</p>
              <p class="text-xs text-muted">dari {{ data.employees.limit === -1 ? 'tanpa batas' : data.employees.limit }} di paket Anda</p>
            </UCard>
          </NuxtLink>
          <NuxtLink
            v-if="data.attendance"
            to="/app/attendance"
          >
            <UCard class="h-full hover:ring-primary/40">
              <p class="text-sm text-muted">Hadir hari ini</p>
              <p class="mt-1 text-3xl font-semibold tabular">{{ present }}<span class="text-lg font-normal text-muted">/{{ expected }}</span></p>
              <p class="text-xs text-muted">{{ data.attendance.late ?? 0 }} terlambat · {{ data.attendance.absent ?? 0 }} tidak hadir</p>
            </UCard>
          </NuxtLink>
          <NuxtLink to="/app/approvals">
            <UCard class="h-full hover:ring-primary/40">
              <p class="text-sm text-muted">Menunggu persetujuan Anda</p>
              <p
                class="mt-1 text-3xl font-semibold tabular"
                :class="data.pendingApprovals ? 'text-warning' : ''"
              >{{ data.pendingApprovals }}</p>
              <p class="text-xs text-muted">cuti, lembur, reimbursement, koreksi</p>
            </UCard>
          </NuxtLink>
          <UCard v-if="data.onLeaveToday !== null">
            <p class="text-sm text-muted">
              Sedang cuti hari ini
            </p>
            <p class="mt-1 text-3xl font-semibold tabular">
              {{ data.onLeaveToday }}
            </p>
            <NuxtLink
              to="/app/leave"
              class="text-xs text-primary hover:underline"
            >Lihat kalender cuti</NuxtLink>
          </UCard>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <UCard v-if="data.contractsExpiring !== null">
            <div class="flex items-center gap-3">
              <UIcon
                name="i-lucide-file-clock"
                class="size-6"
                :class="data.contractsExpiring ? 'text-warning' : 'text-muted'"
              />
              <div class="flex-1">
                <p class="font-medium">
                  {{ data.contractsExpiring }} kontrak berakhir ≤ 30 hari
                </p>
                <p class="text-xs text-muted">
                  Perpanjang atau siapkan pengganti.
                </p>
              </div>
              <UButton
                to="/app/employees?contract=expiring"
                label="Lihat"
                size="sm"
                variant="outline"
              />
            </div>
          </UCard>
          <UCard v-if="auth.hasAbility('payroll.read')">
            <div class="flex items-center gap-3">
              <UIcon
                name="i-lucide-wallet"
                class="size-6 text-primary"
              />
              <div class="flex-1">
                <p class="font-medium">
                  Payroll {{ data.lastPayroll ? data.lastPayroll.periodLabel : 'belum pernah dijalankan' }}
                </p>
                <StatusBadge
                  v-if="data.lastPayroll"
                  :map="PAYROLL_STATUS_META"
                  :value="data.lastPayroll.status"
                  size="xs"
                />
              </div>
              <UButton
                :to="data.lastPayroll ? `/app/payroll/${data.lastPayroll.id}` : '/app/payroll'"
                :label="data.lastPayroll ? 'Buka' : 'Mulai'"
                size="sm"
                variant="outline"
              />
            </div>
          </UCard>
        </div>
      </template>
    </div>
  </PagePanel>
</template>
