<script setup lang="ts">
// Laporan HR: headcount, absensi, cuti, payroll (+ ekspor CSV bila paket mengizinkan).
// Rentang dijepit ke riwayat laporan paket (reportRetentionDays) — ditandai bila terpotong.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Laporan' })

interface Group { key: string, label: string, count: number }
const auth = useTenantAuth()
const toast = useApiToast()
const entitlements = useEntitlements()
const tab = ref('headcount')
const today = localTodayKey()
const from = ref(`${today.slice(0, 7)}-01`)
const to = ref(today)
const year = ref(Number(today.slice(0, 4)))
const loading = ref(false)

const headcount = ref<{ clamped: boolean, from: string, active: number, joiners: number, leavers: number, turnoverPercent: number, byStatus: Group[], byType: Group[], byBranch: Group[], byDepartment: Group[] } | null>(null)
const attendance = ref<{ clamped: boolean, from: string, items: Array<{ employeeId: string, employeeNumber: string, fullName: string, branchName: string, departmentName: string | null, scheduledDays: number, presentDays: number, lateDays: number, absentDays: number, leaveDays: number, lateMinutes: number }> } | null>(null)
const leave = ref<{ types: Array<{ id: string, name: string }>, byType: Array<{ leaveTypeId: string, name: string, days: number, requests: number }>, items: Array<{ employeeId: string, fullName: string, employeeNumber: string, byType: Record<string, number> }> } | null>(null)
const payroll = ref<{ months: Array<{ month: number, label: string, runs: number, employees: number, gross: number, net: number, pph21: number, employerCost: number }>, total: { gross: number, net: number, pph21: number, employerCost: number } } | null>(null)

async function load() {
  loading.value = true
  try {
    if (tab.value === 'headcount') headcount.value = await apiFetch('/api/app/reports/headcount', { query: { from: from.value, to: to.value } })
    if (tab.value === 'attendance') attendance.value = await apiFetch('/api/app/reports/attendance', { query: { from: from.value, to: to.value } })
    if (tab.value === 'leave') leave.value = await apiFetch('/api/app/reports/leave', { query: { year: year.value } })
    if (tab.value === 'payroll') payroll.value = await apiFetch('/api/app/reports/payroll', { query: { year: year.value } })
  } catch (error) {
    toast.error(error)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch([tab, from, to, year], load)
async function exportCsv() {
  if (!entitlements.can('export')) return entitlements.upgradeRequired('export')
  await downloadFromApi('/api/app/reports/export', `laporan-${tab.value}.csv`, { kind: tab.value, from: from.value, to: to.value, year: year.value }).catch(toast.error)
}
const tabs = computed(() => [
  { label: 'Karyawan', value: 'headcount', icon: 'i-lucide-users' },
  { label: 'Absensi', value: 'attendance', icon: 'i-lucide-clock' },
  { label: 'Cuti', value: 'leave', icon: 'i-lucide-plane' },
  ...(auth.hasAbility('payroll.read') ? [{ label: 'Payroll', value: 'payroll', icon: 'i-lucide-wallet' }] : [])
])
const yearOptions = [year.value - 1, year.value].map(y => ({ label: String(y), value: y }))
const maxOf = (groups: Group[]) => Math.max(1, ...groups.map(g => g.count))
const clamped = computed(() => (tab.value === 'headcount' ? headcount.value : tab.value === 'attendance' ? attendance.value : null))
</script>

<template>
  <PagePanel title="Laporan">
    <template #actions>
      <UButton
        label="Ekspor CSV"
        icon="i-lucide-download"
        variant="outline"
        :trailing-icon="entitlements.can('export') ? undefined : 'i-lucide-lock'"
        @click="exportCsv"
      />
    </template>
    <div class="space-y-4">
      <UTabs
        v-model="tab"
        :items="tabs"
        :content="false"
      />
      <div class="flex flex-wrap items-center gap-3">
        <template v-if="tab === 'headcount' || tab === 'attendance'">
          <UInput
            v-model="from"
            type="date"
            class="w-44"
            aria-label="Dari"
          />
          <span class="text-muted">–</span>
          <UInput
            v-model="to"
            type="date"
            :max="today"
            class="w-44"
            aria-label="Sampai"
          />
        </template>
        <USelect
          v-else
          v-model="year"
          :items="yearOptions"
          class="w-28"
        />
        <UIcon
          v-if="loading"
          name="i-lucide-loader-circle"
          class="size-4 animate-spin text-muted"
        />
      </div>
      <UAlert
        v-if="clamped?.clamped"
        color="info"
        variant="subtle"
        icon="i-lucide-history"
        :title="`Paket Anda menyimpan riwayat laporan terbatas — data ditampilkan mulai ${formatDateShort(clamped.from)}.`"
      />

      <template v-if="tab === 'headcount' && headcount">
        <div class="grid gap-3 sm:grid-cols-4">
          <UCard
            v-for="s in [{ l: 'Karyawan aktif', v: headcount.active }, { l: 'Masuk', v: headcount.joiners }, { l: 'Keluar', v: headcount.leavers }, { l: 'Turnover', v: `${headcount.turnoverPercent}%` }]"
            :key="s.l"
            :ui="{ body: 'p-4 sm:p-4' }"
          >
            <p class="text-xs text-muted">
              {{ s.l }}
            </p>
            <p class="text-2xl font-semibold tabular">
              {{ s.v }}
            </p>
          </UCard>
        </div>
        <div class="grid gap-4 lg:grid-cols-2">
          <UCard
            v-for="block in [{ t: 'Per kantor', g: headcount.byBranch }, { t: 'Per departemen', g: headcount.byDepartment }, { t: 'Per jenis kepegawaian', g: headcount.byType }, { t: 'Per status', g: headcount.byStatus }]"
            :key="block.t"
          >
            <p class="mb-3 text-sm font-semibold">
              {{ block.t }}
            </p>
            <ul class="space-y-2 text-sm">
              <li
                v-for="g in block.g"
                :key="g.key"
                class="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3"
              >
                <span class="truncate">{{ g.label }}</span>
                <span class="h-2 rounded bg-elevated"><span
                  class="block h-2 rounded bg-primary"
                  :style="{ width: `${(g.count / maxOf(block.g)) * 100}%` }"
                /></span>
                <span class="text-right tabular">{{ g.count }}</span>
              </li>
            </ul>
          </UCard>
        </div>
      </template>

      <UCard
        v-if="tab === 'attendance' && attendance"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <div class="overflow-x-auto">
          <table class="w-full min-w-[720px] text-sm">
            <thead class="border-b border-default text-xs text-muted">
              <tr>
                <th class="px-4 py-2 text-left font-medium">
                  Karyawan
                </th>
                <th class="px-3 py-2 text-right font-medium">
                  Hari kerja
                </th>
                <th class="px-3 py-2 text-right font-medium">
                  Hadir
                </th>
                <th class="px-3 py-2 text-right font-medium">
                  Terlambat
                </th>
                <th class="px-3 py-2 text-right font-medium">
                  Cuti
                </th>
                <th class="px-3 py-2 text-right font-medium">
                  Alpa
                </th>
                <th class="px-4 py-2 text-right font-medium">
                  Kehadiran
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr
                v-for="r in attendance.items"
                :key="r.employeeId"
              >
                <td class="px-4 py-2">
                  <p class="font-medium">
                    {{ r.fullName }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ r.employeeNumber }} · {{ r.departmentName ?? r.branchName }}
                  </p>
                </td>
                <td class="px-3 py-2 text-right tabular">
                  {{ r.scheduledDays }}
                </td>
                <td class="px-3 py-2 text-right tabular">
                  {{ r.presentDays }}
                </td>
                <td
                  class="px-3 py-2 text-right tabular"
                  :class="r.lateDays ? 'text-warning' : ''"
                >
                  {{ r.lateDays }}
                </td>
                <td class="px-3 py-2 text-right tabular">
                  {{ r.leaveDays }}
                </td>
                <td
                  class="px-3 py-2 text-right tabular"
                  :class="r.absentDays ? 'text-error' : ''"
                >
                  {{ r.absentDays }}
                </td>
                <td class="px-4 py-2 text-right tabular">
                  {{ r.scheduledDays ? Math.round(((r.presentDays + r.leaveDays) / r.scheduledDays) * 100) : 0 }}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <template v-if="tab === 'leave' && leave">
        <div class="grid gap-3 sm:grid-cols-3">
          <UCard
            v-for="t in leave.byType.filter(x => x.requests)"
            :key="t.leaveTypeId"
            :ui="{ body: 'p-4 sm:p-4' }"
          >
            <p class="text-xs text-muted">
              {{ t.name }}
            </p>
            <p class="text-2xl font-semibold tabular">
              {{ t.days }} <span class="text-sm font-normal text-muted">hari · {{ t.requests }} pengajuan</span>
            </p>
          </UCard>
        </div>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="border-b border-default text-xs text-muted">
                <tr>
                  <th class="px-4 py-2 text-left font-medium">
                    Karyawan
                  </th>
                  <th
                    v-for="t in leave.types"
                    :key="t.id"
                    class="px-3 py-2 text-right font-medium"
                  >
                    {{ t.name }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr
                  v-for="r in leave.items"
                  :key="r.employeeId"
                >
                  <td class="px-4 py-2">
                    {{ r.fullName }}
                  </td>
                  <td
                    v-for="t in leave.types"
                    :key="t.id"
                    class="px-3 py-2 text-right tabular"
                  >
                    {{ r.byType[t.id] || '' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p
            v-if="!leave.items.length"
            class="p-6 text-center text-sm text-muted"
          >
            Belum ada cuti disetujui pada {{ year }}.
          </p>
        </UCard>
      </template>

      <UCard
        v-if="tab === 'payroll' && payroll"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-sm">
            <thead class="border-b border-default text-xs text-muted">
              <tr>
                <th class="px-4 py-2 text-left font-medium">
                  Periode
                </th>
                <th class="px-3 py-2 text-right font-medium">
                  Karyawan
                </th>
                <th class="px-3 py-2 text-right font-medium">
                  Bruto
                </th>
                <th class="px-3 py-2 text-right font-medium">
                  PPh 21
                </th>
                <th class="px-3 py-2 text-right font-medium">
                  Bersih
                </th>
                <th class="px-4 py-2 text-right font-medium">
                  Biaya perusahaan
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr
                v-for="m in payroll.months"
                :key="m.month"
                :class="m.runs ? '' : 'text-muted'"
              >
                <td class="px-4 py-2">
                  {{ m.label }}
                </td>
                <td class="px-3 py-2 text-right tabular">
                  {{ m.employees || '' }}
                </td>
                <td class="px-3 py-2 text-right tabular">
                  {{ m.runs ? formatIDR(m.gross) : '–' }}
                </td>
                <td class="px-3 py-2 text-right tabular">
                  {{ m.runs ? formatIDR(m.pph21) : '–' }}
                </td>
                <td class="px-3 py-2 text-right tabular">
                  {{ m.runs ? formatIDR(m.net) : '–' }}
                </td>
                <td class="px-4 py-2 text-right tabular">
                  {{ m.runs ? formatIDR(m.employerCost) : '–' }}
                </td>
              </tr>
              <tr class="font-semibold">
                <td class="px-4 py-2">
                  Total {{ year }}
                </td>
                <td />
                <td class="px-3 py-2 text-right tabular">
                  {{ formatIDR(payroll.total.gross) }}
                </td>
                <td class="px-3 py-2 text-right tabular">
                  {{ formatIDR(payroll.total.pph21) }}
                </td>
                <td class="px-3 py-2 text-right tabular">
                  {{ formatIDR(payroll.total.net) }}
                </td>
                <td class="px-4 py-2 text-right tabular">
                  {{ formatIDR(payroll.total.employerCost) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="px-4 py-3 text-xs text-muted">
          Hanya run yang disetujui / tercatat dibayar.
        </p>
      </UCard>
    </div>
  </PagePanel>
</template>
