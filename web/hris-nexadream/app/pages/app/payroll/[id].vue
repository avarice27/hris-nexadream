<script setup lang="ts">
import { PAYROLL_STATUS_META } from '#shared/utils/status'
import type { PayslipDetail } from '~/types/hr'

// Detail run payroll. Hitung berjalan per potongan (25 karyawan/permintaan) sampai selesai — aman untuk
// batas waktu fungsi serverless dan bisa dilanjutkan bila terputus. Run disetujui tidak bisa diubah: void + run ulang.
definePageMeta({ layout: 'tenant' })

interface Run { id: string, code: string, periodLabel: string, periodStart: string, periodEnd: string, branchName: string | null, includeThr: boolean, status: string, employeeCount: number, calculatedCount: number, totalGross: number, totalDeductions: number, totalNet: number, totalPph21: number, totalEmployerCost: number, calculatedAt: string | null, approvedAt: string | null, paidRecordedAt: string | null, paidDate: string | null, voidedAt: string | null, voidReason: string | null, note: string | null }
interface Slip { id: string, code: string, employeeId: string, employeeName: string, employeeNumber: string, departmentName: string | null, positionName: string | null, gross: number, totalDeductions: number, net: number, pph21: number, notes: string[], viewedAt: string | null }

const route = useRoute()
const auth = useTenantAuth()
const toast = useApiToast()
const { confirm } = useConfirmDialog()
const id = computed(() => String(route.params.id))
const data = ref<{ run: Run, payslips: Slip[] } | null>(null)
const errorMessage = ref('')
const canWrite = computed(() => auth.hasAbility('payroll.write'))
async function load() {
  try {
    data.value = await apiFetch(`/api/app/payroll/runs/${id.value}`)
    useHead({ title: `Payroll ${data.value!.run.periodLabel}` })
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}

// Hitung (berpotongan)
const calculating = ref(false)
const progress = ref<{ calculated: number, total: number } | null>(null)
async function calculate(restart = true) {
  calculating.value = true
  try {
    let first = restart
    for (let guard = 0; guard < 200; guard++) {
      const r = await apiFetch<{ done: boolean, calculated: number, total: number }>(`/api/app/payroll/runs/${id.value}/calculate`, { method: 'POST', body: { restart: first } })
      first = false
      progress.value = { calculated: r.calculated, total: r.total }
      if (r.done) break
    }
    toast.success('Perhitungan selesai')
    await load()
  } catch (error) {
    toast.error(error, 'Perhitungan terhenti. Klik "Lanjutkan hitung" untuk meneruskan.')
  } finally {
    calculating.value = false
    progress.value = null
  }
}
onMounted(async () => {
  await load()
  if (route.query.calculate && data.value?.run.status === 'draft' && !data.value.run.calculatedAt) await calculate(true)
})

async function approve() {
  if (!await confirm({ title: 'Setujui payroll ini?', description: 'Setelah disetujui, run tidak bisa diubah (hanya bisa dibatalkan & dihitung ulang). Slip gaji akan terbit sesuai pengaturan.', confirmLabel: 'Setujui' })) return
  try {
    await apiFetch(`/api/app/payroll/runs/${id.value}/approve`, { method: 'POST' })
    toast.success('Payroll disetujui')
    await load()
  } catch (error) {
    toast.error(error)
  }
}
const paidOpen = ref(false)
const paidDate = ref(localTodayKey())
async function markPaid() {
  try {
    await apiFetch(`/api/app/payroll/runs/${id.value}/mark-paid`, { method: 'POST', body: { paidDate: paidDate.value } })
    paidOpen.value = false
    toast.success('Tercatat sudah dibayar')
    await load()
  } catch (error) {
    toast.error(error)
  }
}
const voidOpen = ref(false)
const voidReason = ref('')
async function voidRun() {
  try {
    await apiFetch(`/api/app/payroll/runs/${id.value}/void`, { method: 'POST', body: { reason: voidReason.value } })
    voidOpen.value = false
    toast.success('Run dibatalkan', 'Buat run baru untuk periode ini bila perlu menghitung ulang.')
    await load()
  } catch (error) {
    toast.error(error)
  }
}
async function exportCsv(kind: 'summary' | 'bank') {
  await downloadFromApi(`/api/app/payroll/runs/${id.value}/export`, `payroll-${data.value?.run.code}-${kind === 'bank' ? 'transfer' : 'rekap'}.csv`, { kind }).catch(toast.error)
}

// Slip
const slipOpen = ref(false)
const slip = ref<PayslipDetail | null>(null)
async function openSlip(s: Slip) {
  slip.value = null
  slipOpen.value = true
  try {
    slip.value = await apiFetch<PayslipDetail>(`/api/app/payroll/payslips/${s.id}`)
  } catch (error) {
    slipOpen.value = false
    toast.error(error)
  }
}
const search = ref('')
const filtered = computed(() => (data.value?.payslips ?? []).filter(s => !search.value || `${s.employeeName} ${s.employeeNumber}`.toLowerCase().includes(search.value.toLowerCase())))
const warnings = computed(() => (data.value?.payslips ?? []).filter(s => s.notes.some(n => n.startsWith('Gaji pokok belum'))))
const exportItems = computed(() => [[
  { label: 'Rekap payroll (CSV)', icon: 'i-lucide-sheet', onSelect: () => exportCsv('summary') },
  ...(auth.hasAbility('employees.sensitive.read') ? [{ label: 'Daftar transfer bank (CSV)', icon: 'i-lucide-landmark', onSelect: () => exportCsv('bank') }] : [])
]])
const printSlip = () => window.print()
</script>

<template>
  <PagePanel :title="data ? `Payroll ${data.run.periodLabel}` : 'Payroll'">
    <template #actions>
      <template v-if="data && canWrite">
        <UButton
          v-if="data.run.status === 'draft'"
          :label="data.run.calculatedAt ? 'Hitung ulang' : (data.run.calculatedCount ? 'Lanjutkan hitung' : 'Hitung')"
          icon="i-lucide-calculator"
          variant="outline"
          :loading="calculating"
          @click="calculate(!data.run.calculatedCount || !!data.run.calculatedAt)"
        />
        <UButton
          v-if="data.run.status === 'draft' && data.run.calculatedAt"
          label="Setujui"
          icon="i-lucide-check"
          :disabled="calculating"
          @click="approve"
        />
        <UButton
          v-if="data.run.status === 'approved'"
          label="Tandai sudah dibayar"
          icon="i-lucide-banknote"
          @click="paidOpen = true"
        />
      </template>
      <UDropdownMenu
        v-if="data"
        :items="exportItems"
      >
        <UButton
          icon="i-lucide-download"
          label="Ekspor"
          variant="outline"
          color="neutral"
        />
      </UDropdownMenu>
      <UButton
        v-if="data && canWrite && data.run.status !== 'void'"
        icon="i-lucide-ban"
        aria-label="Batalkan run"
        variant="ghost"
        color="error"
        @click="voidOpen = true"
      />
    </template>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!data"
      class="h-64 w-full"
    />
    <div
      v-else
      class="space-y-5"
    >
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <UButton
          to="/app/payroll"
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Kembali"
        />
        <span class="font-mono text-muted">{{ data.run.code }}</span>
        <StatusBadge
          :map="PAYROLL_STATUS_META"
          :value="data.run.status"
        />
        <span class="text-muted">{{ formatDateShort(data.run.periodStart) }} – {{ formatDateShort(data.run.periodEnd) }} · {{ data.run.branchName ?? 'Semua kantor' }}<span v-if="data.run.includeThr"> · termasuk THR</span></span>
      </div>

      <UAlert
        v-if="data.run.status === 'void'"
        color="error"
        variant="subtle"
        icon="i-lucide-ban"
        :title="`Run dibatalkan ${formatDateTimeId(data.run.voidedAt)}`"
        :description="data.run.voidReason ?? undefined"
      />
      <div
        v-if="calculating && progress"
        class="space-y-1"
      >
        <UProgress :model-value="progress.total ? (progress.calculated / progress.total) * 100 : 0" />
        <p class="text-xs text-muted">
          Menghitung {{ progress.calculated }} / {{ progress.total }} karyawan…
        </p>
      </div>
      <UAlert
        v-else-if="data.run.status === 'draft' && !data.run.calculatedAt"
        color="warning"
        variant="subtle"
        icon="i-lucide-calculator"
        :title="data.run.calculatedCount ? `Perhitungan belum selesai (${data.run.calculatedCount}/${data.run.employeeCount}).` : 'Run belum dihitung.'"
      />
      <UAlert
        v-if="warnings.length"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="`${warnings.length} karyawan belum punya gaji pokok untuk periode ini.`"
        :description="warnings.map(w => w.employeeName).join(', ')"
      />

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <UCard
          v-for="s in [
            { l: 'Karyawan', v: String(data.run.employeeCount) },
            { l: 'Total pendapatan', v: formatIDR(data.run.totalGross) },
            { l: 'Total potongan', v: formatIDR(data.run.totalDeductions) },
            { l: 'Gaji bersih (transfer)', v: formatIDR(data.run.totalNet) },
            { l: 'Biaya perusahaan', v: formatIDR(data.run.totalEmployerCost) }
          ]"
          :key="s.l"
          :ui="{ body: 'p-4 sm:p-4' }"
        >
          <p class="text-xs text-muted">
            {{ s.l }}
          </p>
          <p class="mt-1 text-lg font-semibold tabular">
            {{ s.v }}
          </p>
        </UCard>
      </div>
      <p class="text-xs text-muted">
        PPh 21 dipotong: {{ formatIDR(data.run.totalPph21) }}. Biaya perusahaan = pendapatan + iuran BPJS bagian perusahaan.
      </p>

      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Cari karyawan…"
        class="w-full sm:w-64"
      />
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[720px] text-sm">
            <thead class="border-b border-default text-left text-xs text-muted">
              <tr>
                <th class="px-4 py-2 font-medium">
                  Karyawan
                </th>
                <th class="px-4 py-2 text-right font-medium">
                  Pendapatan
                </th>
                <th class="px-4 py-2 text-right font-medium">
                  PPh 21
                </th>
                <th class="px-4 py-2 text-right font-medium">
                  Potongan
                </th>
                <th class="px-4 py-2 text-right font-medium">
                  Bersih
                </th>
                <th />
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr
                v-for="s in filtered"
                :key="s.id"
                class="cursor-pointer hover:bg-elevated/60"
                @click="openSlip(s)"
              >
                <td class="px-4 py-2">
                  <p class="font-medium">
                    {{ s.employeeName }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ s.employeeNumber }} · {{ s.positionName ?? '-' }}<span
                      v-if="s.notes.length"
                      class="text-warning"
                    > · {{ s.notes.length }} catatan</span>
                  </p>
                </td>
                <td class="px-4 py-2 text-right tabular">
                  {{ formatIDR(s.gross) }}
                </td>
                <td class="px-4 py-2 text-right tabular">
                  {{ formatIDR(s.pph21) }}
                </td>
                <td class="px-4 py-2 text-right tabular">
                  {{ formatIDR(s.totalDeductions) }}
                </td>
                <td class="px-4 py-2 text-right font-medium tabular">
                  {{ formatIDR(s.net) }}
                </td>
                <td class="px-2 py-2 text-right">
                  <UIcon
                    v-if="s.viewedAt"
                    name="i-lucide-eye"
                    class="size-4 text-muted"
                    title="Sudah dilihat karyawan"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-if="!filtered.length"
          class="p-6 text-center text-sm text-muted"
        >
          Belum ada slip gaji.
        </p>
      </UCard>
    </div>

    <USlideover
      v-model:open="slipOpen"
      title="Slip gaji"
      :ui="{ content: 'max-w-3xl' }"
    >
      <template #body>
        <USkeleton
          v-if="!slip"
          class="h-96 w-full"
        />
        <template v-else>
          <div class="mb-4 flex justify-end">
            <UButton
              icon="i-lucide-printer"
              label="Cetak"
              size="sm"
              variant="outline"
              @click="printSlip"
            />
          </div>
          <PayslipView :payslip="slip" />
        </template>
      </template>
    </USlideover>

    <UModal
      v-model:open="paidOpen"
      title="Tandai sudah dibayar"
      description="Catat tanggal transfer gaji yang dilakukan perusahaan. Nexadream tidak mentransfer dana."
    >
      <template #body>
        <UFormField label="Tanggal transfer">
          <UInput
            v-model="paidDate"
            type="date"
            class="w-full"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Batal"
            variant="ghost"
            color="neutral"
            @click="paidOpen = false"
          />
          <UButton
            label="Simpan"
            @click="markPaid"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="voidOpen"
      title="Batalkan (void) run ini?"
      description="Run disimpan sebagai riwayat dengan status dibatalkan; slip tidak lagi terlihat karyawan. Lembur & reimbursement kembali tersedia untuk run baru."
    >
      <template #body>
        <UFormField
          label="Alasan"
          required
        >
          <UTextarea
            v-model="voidReason"
            :rows="2"
            class="w-full"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Batal"
            variant="ghost"
            color="neutral"
            @click="voidOpen = false"
          />
          <UButton
            label="Void run"
            color="error"
            :disabled="voidReason.trim().length < 5"
            @click="voidRun"
          />
        </div>
      </template>
    </UModal>
  </PagePanel>
</template>
