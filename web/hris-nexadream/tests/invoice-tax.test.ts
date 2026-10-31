import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invoiceTaxBreakdown } from '../shared/utils/invoice-tax'

test('PPN 12% on DPP nilai lain 11/12 = effective 11% (PMK 131/2024), price inclusive', () => {
  const r = invoiceTaxBreakdown(1_110_000, { pkp: true, vatRatePercent: 12 })
  assert.equal(r.taxBase, 1_000_000)
  assert.equal(r.otherTaxBase, 916_667)
  assert.equal(r.vat, 110_000)
  assert.equal(r.taxBase + r.vat, r.total)
  // PPN ≈ 12% × DPP nilai lain
  assert.ok(Math.abs(r.vat - 0.12 * r.otherTaxBase) < 1)
})

test('breakdown always sums to the total on odd amounts', () => {
  for (const total of [99_000, 149_000, 299_000, 1_490_000, 4_999_999]) {
    const r = invoiceTaxBreakdown(total, { pkp: true, vatRatePercent: 12 })
    assert.equal(r.taxBase + r.vat, total)
    assert.ok(Math.abs(r.vat - 0.12 * r.otherTaxBase) <= 1)
  }
})

test('non-PKP seller charges no VAT', () => {
  const r = invoiceTaxBreakdown(500_000, { pkp: false, vatRatePercent: 12 })
  assert.equal(r.vat, 0)
  assert.equal(r.taxBase, 500_000)
})

test('stamp duty applies to receipts strictly above Rp5.000.000 (UU 10/2020)', () => {
  assert.equal(invoiceTaxBreakdown(5_000_000, { pkp: true, vatRatePercent: 12 }).stampDutyApplies, false)
  assert.equal(invoiceTaxBreakdown(5_000_001, { pkp: true, vatRatePercent: 12 }).stampDutyApplies, true)
})
