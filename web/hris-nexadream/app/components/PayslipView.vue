<script setup lang="ts">
import { PTKP_LABELS, type PtkpStatus } from '#shared/utils/payroll-rules'
import type { PayslipDetail } from '~/types/hr'
import { PAYROLL_STATUS_META } from '#shared/utils/status'

// Slip gaji (dapat dicetak). Data adalah snapshot run — nominal tidak pernah dihitung ulang di klien.
defineProps<{ payslip: PayslipDetail }>()
const rp = (n: number) => formatIDR(n)
</script>

<template>
  <div class="print-area space-y-5 text-sm">
    <div class="flex flex-wrap items-start justify-between gap-4 border-b border-default pb-4">
      <div class="flex items-center gap-3">
        <img
          v-if="payslip.company.logoUrl"
          :src="payslip.company.logoUrl"
          alt=""
          class="size-10 rounded object-contain"
        >
        <div>
          <p class="font-semibold text-highlighted">
            {{ payslip.company.name }}
          </p>
          <p class="text-muted">
            Slip gaji · {{ payslip.periodLabel }}
          </p>
        </div>
      </div>
      <div class="text-right">
        <p class="font-mono text-xs text-muted">
          {{ payslip.code }}
        </p>
        <StatusBadge
          :map="PAYROLL_STATUS_META"
          :value="payslip.runStatus"
          size="xs"
        />
        <p
          v-if="payslip.paidDate"
          class="mt-1 text-xs text-muted"
        >
          Dibayar {{ formatDateShort(payslip.paidDate) }}
        </p>
      </div>
    </div>

    <dl class="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
      <div>
        <dt class="text-xs text-muted">
          Nama
        </dt><dd class="font-medium">
          {{ payslip.employee.name }}
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted">
          NIP
        </dt><dd>{{ payslip.employee.number }}</dd>
      </div>
      <div>
        <dt class="text-xs text-muted">
          Jabatan
        </dt><dd>{{ payslip.employee.position ?? '-' }}</dd>
      </div>
      <div>
        <dt class="text-xs text-muted">
          Departemen
        </dt><dd>{{ payslip.employee.department ?? '-' }}</dd>
      </div>
      <div>
        <dt class="text-xs text-muted">
          NPWP
        </dt><dd class="tabular">
          {{ payslip.employee.npwp ?? '-' }}
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted">
          Rekening
        </dt><dd class="tabular">
          {{ payslip.employee.bank ?? '-' }}
        </dd>
      </div>
    </dl>

    <UAlert
      v-if="!payslip.data"
      color="error"
      variant="subtle"
      title="Rincian slip tidak dapat dibuka."
      description="Kunci enkripsi data HR mungkin telah berubah. Hubungi tim dukungan."
    />
    <template v-else>
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <p class="mb-1 font-semibold">
            Pendapatan
          </p>
          <table class="w-full">
            <tbody class="divide-y divide-default">
              <tr
                v-for="line in payslip.data.earnings"
                :key="line.code"
              >
                <td class="py-1.5">
                  {{ line.name }}
                </td>
                <td class="py-1.5 text-right tabular">
                  {{ rp(line.amount) }}
                </td>
              </tr>
              <tr class="font-semibold">
                <td class="py-1.5">
                  Total pendapatan
                </td>
                <td class="py-1.5 text-right tabular">
                  {{ rp(payslip.data.gross) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <p class="mb-1 font-semibold">
            Potongan
          </p>
          <table class="w-full">
            <tbody class="divide-y divide-default">
              <tr
                v-for="line in payslip.data.deductions"
                :key="line.code"
              >
                <td class="py-1.5">
                  {{ line.name }}
                </td>
                <td class="py-1.5 text-right tabular">
                  {{ rp(line.amount) }}
                </td>
              </tr>
              <tr
                v-if="!payslip.data.deductions.length"
                class="text-muted"
              >
                <td class="py-1.5">
                  Tidak ada potongan
                </td>
                <td />
              </tr>
              <tr class="font-semibold">
                <td class="py-1.5">
                  Total potongan
                </td>
                <td class="py-1.5 text-right tabular">
                  {{ rp(payslip.data.totalDeductions) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="flex items-center justify-between rounded-lg bg-primary/10 px-4 py-3">
        <span class="font-semibold">Gaji bersih (take home pay)</span>
        <span class="text-xl font-semibold text-highlighted tabular">{{ rp(payslip.data.net) }}</span>
      </div>

      <div class="grid gap-4 text-xs text-muted md:grid-cols-2">
        <div class="space-y-1">
          <p class="font-medium text-default">
            Pajak & status
          </p>
          <p>PTKP: {{ PTKP_LABELS[payslip.data.ptkpStatus as PtkpStatus] ?? payslip.data.ptkpStatus }}</p>
          <p>Bruto PPh 21: {{ rp(payslip.data.taxableGross) }}</p>
          <p>
            Metode: {{ payslip.data.pph21Method === 'ter' ? `TER kategori ${payslip.data.terCategory} (${payslip.data.terRate}%)` : 'Perhitungan masa pajak terakhir (Pasal 17)' }}
          </p>
        </div>
        <div class="space-y-1">
          <p class="font-medium text-default">
            Ditanggung perusahaan (tidak memotong gaji)
          </p>
          <p
            v-for="line in payslip.data.employer"
            :key="line.code"
            class="flex justify-between gap-2"
          >
            <span>{{ line.name }}</span><span class="tabular">{{ rp(line.amount) }}</span>
          </p>
        </div>
      </div>

      <div class="text-xs text-muted">
        <p>
          Kehadiran: {{ payslip.data.attendance.presentDays }}/{{ payslip.data.attendance.scheduledDays }} hari hadir ·
          {{ payslip.data.attendance.lateDays }} terlambat · {{ payslip.data.attendance.leaveDays }} cuti · {{ payslip.data.attendance.absentDays }} tidak hadir
        </p>
        <p
          v-for="(note, i) in payslip.data.notes"
          :key="i"
        >
          {{ note }}
        </p>
        <p class="mt-2">
          Dokumen ini dibuat oleh sistem. HRIS Nexadream menghitung dan mencatat gaji; pembayaran dilakukan oleh perusahaan.
        </p>
      </div>
    </template>
  </div>
</template>
