// Rincian PPN untuk invoice langganan (D24). Harga langganan SUDAH TERMASUK PPN.
// UU HPP: tarif PPN 12%; PMK 131/2024: untuk selain barang mewah, PPN = 12% × DPP nilai lain,
// DPP nilai lain = 11/12 × harga jual/penggantian → beban efektif 11% dari DPP.
// Bukti pembayaran > Rp5.000.000 terutang bea meterai Rp10.000 (UU 10/2020 Pasal 3 ayat (2) huruf g).

export const OTHER_TAX_BASE_FRACTION = 11 / 12
export const STAMP_DUTY_THRESHOLD = 5_000_000
export const STAMP_DUTY_AMOUNT = 10_000

export interface InvoiceTaxBreakdown {
  total: number
  /** DPP: harga sebelum PPN */
  taxBase: number
  /** DPP nilai lain: 11/12 × DPP */
  otherTaxBase: number
  vatRatePercent: number
  vat: number
  stampDutyApplies: boolean
}

/**
 * Pecah total (rupiah, termasuk PPN) menjadi DPP, DPP nilai lain, dan PPN.
 * Pembulatan ke rupiah penuh; PPN = total − DPP agar jumlahnya selalu tepat sama dengan total.
 * Penjual non-PKP: tanpa PPN (DPP = total).
 */
export function invoiceTaxBreakdown(total: number, options: { pkp: boolean, vatRatePercent: number }): InvoiceTaxBreakdown {
  const stampDutyApplies = total > STAMP_DUTY_THRESHOLD
  if (!options.pkp || options.vatRatePercent <= 0) {
    return { total, taxBase: total, otherTaxBase: total, vatRatePercent: 0, vat: 0, stampDutyApplies }
  }
  const effective = (options.vatRatePercent / 100) * OTHER_TAX_BASE_FRACTION
  const taxBase = Math.round(total / (1 + effective))
  const otherTaxBase = Math.round(taxBase * OTHER_TAX_BASE_FRACTION)
  return { total, taxBase, otherTaxBase, vatRatePercent: options.vatRatePercent, vat: total - taxBase, stampDutyApplies }
}
