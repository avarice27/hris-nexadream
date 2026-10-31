<script setup lang="ts">
import { formatDateId, formatIDR } from '#shared/utils/format'

// Invoice + bukti pembayaran langganan (D24) — tampilan cetak. Bukan Faktur Pajak:
// Faktur Pajak diterbitkan di Coretax DJP dan nomornya dicantumkan bila sudah ada.
export interface InvoiceDocumentData {
  number: string
  issuedAt: string
  description: string
  seller: { name: string, npwp: string | null, address: string | null, isPkp: boolean }
  buyer: { name: string, address: string | null, npwp: string | null }
  total: number
  taxBase: number
  otherTaxBase: number
  vatRatePercent: number
  vat: number
  stampDutyApplies: boolean
  stampDutyAmount: number
  taxInvoiceNumber: string | null
  payment: { orderId: string, paymentType: string | null }
}

defineProps<{ invoice: InvoiceDocumentData }>()
</script>

<template>
  <article class="mx-auto max-w-3xl space-y-6 rounded-lg border border-default bg-default p-8 text-sm print:border-0 print:p-0">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="space-y-1">
        <img
          src="/images/nexadream-logo.png"
          alt="Nexadream"
          class="size-10"
        >
        <p class="font-semibold text-highlighted">
          {{ invoice.seller.name }}
        </p>
        <p
          v-if="invoice.seller.address"
          class="whitespace-pre-line text-muted"
        >
          {{ invoice.seller.address }}
        </p>
        <p
          v-if="invoice.seller.npwp"
          class="text-muted"
        >
          NPWP {{ invoice.seller.npwp }}
        </p>
      </div>
      <div class="text-right">
        <p class="text-xl font-semibold text-highlighted">
          INVOICE &amp; BUKTI PEMBAYARAN
        </p>
        <p class="tabular">
          {{ invoice.number }}
        </p>
        <p class="text-muted">
          Tanggal {{ formatDateId(invoice.issuedAt) }}
        </p>
        <UBadge
          label="LUNAS"
          color="success"
          variant="subtle"
          class="mt-1"
        />
      </div>
    </header>

    <section class="grid gap-4 sm:grid-cols-2">
      <div>
        <p class="text-xs font-medium uppercase text-muted">
          Ditagihkan kepada
        </p>
        <p class="font-medium">
          {{ invoice.buyer.name }}
        </p>
        <p
          v-if="invoice.buyer.address"
          class="whitespace-pre-line text-muted"
        >
          {{ invoice.buyer.address }}
        </p>
        <p class="text-muted">
          NPWP {{ invoice.buyer.npwp || '—' }}
        </p>
      </div>
      <div class="sm:text-right">
        <p class="text-xs font-medium uppercase text-muted">
          Pembayaran
        </p>
        <p class="tabular">
          {{ invoice.payment.orderId }}
        </p>
        <p
          v-if="invoice.payment.paymentType"
          class="text-muted"
        >
          {{ invoice.payment.paymentType }}
        </p>
      </div>
    </section>

    <table class="w-full border-collapse">
      <thead>
        <tr class="border-b border-default text-left text-xs uppercase text-muted">
          <th class="py-2 font-medium">
            Uraian
          </th>
          <th class="py-2 text-right font-medium">
            Jumlah
          </th>
        </tr>
      </thead>
      <tbody>
        <tr class="border-b border-default">
          <td class="py-3">
            {{ invoice.description }}
          </td>
          <td class="py-3 text-right tabular">
            {{ formatIDR(invoice.taxBase) }}
          </td>
        </tr>
      </tbody>
      <tfoot class="tabular">
        <template v-if="invoice.seller.isPkp && invoice.vat > 0">
          <tr>
            <td class="pt-3 text-right text-muted">
              Dasar Pengenaan Pajak (DPP)
            </td>
            <td class="pt-3 text-right">
              {{ formatIDR(invoice.taxBase) }}
            </td>
          </tr>
          <tr>
            <td class="text-right text-muted">
              DPP nilai lain (11/12 × DPP)
            </td>
            <td class="text-right">
              {{ formatIDR(invoice.otherTaxBase) }}
            </td>
          </tr>
          <tr>
            <td class="text-right text-muted">
              PPN {{ invoice.vatRatePercent }}% × DPP nilai lain
            </td>
            <td class="text-right">
              {{ formatIDR(invoice.vat) }}
            </td>
          </tr>
        </template>
        <tr class="text-base font-semibold text-highlighted">
          <td class="pt-3 text-right">
            Total dibayar
          </td>
          <td class="pt-3 text-right">
            {{ formatIDR(invoice.total) }}
          </td>
        </tr>
      </tfoot>
    </table>

    <footer class="space-y-1 border-t border-default pt-4 text-xs text-muted">
      <p v-if="invoice.seller.isPkp && invoice.vat > 0">
        Harga sudah termasuk PPN. PPN dihitung sesuai PMK 131/2024 (12% × DPP nilai lain 11/12).
      </p>
      <p v-else>
        Penjual tidak memungut PPN atas transaksi ini.
      </p>
      <p>
        Dokumen ini adalah invoice komersial dan bukti pembayaran, bukan Faktur Pajak.
        <template v-if="invoice.taxInvoiceNumber">
          Nomor Faktur Pajak: <span class="tabular">{{ invoice.taxInvoiceNumber }}</span>.
        </template>
        <template v-else>
          Faktur Pajak diterbitkan melalui Coretax DJP untuk pembeli yang mencantumkan NPWP.
        </template>
      </p>
      <p v-if="invoice.stampDutyApplies">
        Bukti pembayaran ini bernilai di atas Rp5.000.000 dan terutang bea meterai {{ formatIDR(invoice.stampDutyAmount) }} (UU 10/2020); e-Meterai dapat dibubuhkan atas permintaan.
      </p>
    </footer>
  </article>
</template>
