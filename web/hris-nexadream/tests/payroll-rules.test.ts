import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PAYROLL_REFERENCE as ref, bpjsContributions, finalPeriodTax, fullMonthsBetween, grossUpAllowance, maxOvertimeMinutes,
  monthlyTerTax, overtimeMultiplierHours, overtimePay, progressiveTax, ptkpAmount, terCategory, thrAmount
} from '../shared/utils/payroll-rules'

test('TER category follows PP 58/2023', () => {
  assert.equal(terCategory('TK0'), 'A')
  assert.equal(terCategory('TK1'), 'A')
  assert.equal(terCategory('K0'), 'A')
  assert.equal(terCategory('TK2'), 'B')
  assert.equal(terCategory('K2'), 'B')
  assert.equal(terCategory('K3'), 'C')
})

test('monthly TER tax uses the bracket rate on gross and floors to rupiah', () => {
  assert.deepEqual(monthlyTerTax(5_400_000, 'TK0', ref), { category: 'A', rate: 0, tax: 0 })
  assert.deepEqual(monthlyTerTax(10_000_000, 'TK0', ref), { category: 'A', rate: 2, tax: 200_000 })
  assert.deepEqual(monthlyTerTax(10_000_000, 'K1', ref), { category: 'B', rate: 1.5, tax: 150_000 })
  assert.deepEqual(monthlyTerTax(10_000_000, 'K3', ref), { category: 'C', rate: 1.5, tax: 150_000 })
  // batas atas inklusif
  assert.equal(monthlyTerTax(5_650_000, 'TK0', ref).rate, 0.25)
  assert.equal(monthlyTerTax(5_650_001, 'TK0', ref).rate, 0.5)
  assert.equal(monthlyTerTax(2_000_000_000, 'TK0', ref).rate, 34)
})

test('PTKP and progressive Pasal 17', () => {
  assert.equal(ptkpAmount('TK0', ref.ptkp), 54_000_000)
  assert.equal(ptkpAmount('K1', ref.ptkp), 63_000_000)
  assert.equal(ptkpAmount('K3', ref.ptkp), 72_000_000)
  assert.equal(progressiveTax(0, ref.progressive), 0)
  assert.equal(progressiveTax(60_000_000, ref.progressive), 3_000_000)
  assert.equal(progressiveTax(100_000_000, ref.progressive), 9_000_000)
  assert.equal(progressiveTax(300_000_000, ref.progressive), 3_000_000 + 28_500_000 + 12_500_000)
})

test('final period recomputes the annual tax minus what was withheld', () => {
  const result = finalPeriodTax({ annualGross: 120_000_000, annualEmployeePension: 3_600_000, monthsWorked: 12, taxWithheldBefore: 2_500_000, status: 'TK0' }, ref)
  assert.equal(result.occupationalCost, 6_000_000)
  assert.equal(result.taxableIncome, 56_400_000)
  assert.equal(result.annualTax, 2_820_000)
  assert.equal(result.tax, 320_000)
  // lebih potong → negatif (dikembalikan)
  assert.ok(finalPeriodTax({ annualGross: 60_000_000, annualEmployeePension: 0, monthsWorked: 12, taxWithheldBefore: 500_000, status: 'TK0' }, ref).tax < 0)
})

test('BPJS contributions respect wage caps and enrolment flags', () => {
  const full = { kesehatanEnrolled: true, ketenagakerjaanEnrolled: true, pensionEnrolled: true, jkkRate: 0.24 }
  assert.deepEqual(bpjsContributions({ wage: 10_000_000, ...full }, ref.bpjs), {
    kesehatanCompany: 400_000, kesehatanEmployee: 100_000, jhtCompany: 370_000, jhtEmployee: 200_000,
    jpCompany: 200_000, jpEmployee: 100_000, jkk: 24_000, jkm: 30_000
  })
  const capped = bpjsContributions({ wage: 15_000_000, ...full }, ref.bpjs)
  assert.equal(capped.kesehatanCompany, 480_000)
  assert.equal(capped.kesehatanEmployee, 120_000)
  assert.equal(capped.jpCompany, 221_726) // batas upah JP Rp11.086.300 (Mar 2026)
  assert.equal(capped.jpEmployee, 110_863)
  assert.equal(capped.jhtEmployee, 300_000)
  const none = bpjsContributions({ wage: 10_000_000, kesehatanEnrolled: false, ketenagakerjaanEnrolled: false, pensionEnrolled: true, jkkRate: 0.24 }, ref.bpjs)
  assert.ok(Object.values(none).every(v => v === 0))
})

test('overtime multipliers per PP 35/2021', () => {
  assert.equal(overtimeMultiplierHours(60, 'workday'), 1.5)
  assert.equal(overtimeMultiplierHours(180, 'workday'), 5.5)
  assert.equal(overtimeMultiplierHours(30, 'workday'), 0.75)
  assert.equal(overtimeMultiplierHours(600, 'rest_day'), 16 + 3 + 4)
  assert.equal(overtimeMultiplierHours(600, 'holiday', 6), 14 + 3 + 8)
  assert.equal(overtimePay(180, 'workday', 3_460_000), 110_000)
  assert.equal(maxOvertimeMinutes('workday'), 240)
})

test('THR proration by full months of service', () => {
  assert.equal(fullMonthsBetween('2025-03-15', '2026-03-14'), 11)
  assert.equal(fullMonthsBetween('2025-03-15', '2026-03-15'), 12)
  assert.deepEqual(thrAmount(6_000_000, '2025-03-15', '2026-03-15'), { months: 12, amount: 6_000_000 })
  assert.deepEqual(thrAmount(6_000_000, '2025-09-01', '2026-03-01'), { months: 6, amount: 3_000_000 })
  assert.deepEqual(thrAmount(6_000_000, '2026-02-20', '2026-03-10'), { months: 0, amount: 0 })
})

test('gross-up allowance equals the PPh 21 it causes (TER fixed point)', () => {
  // K/0, bruto Rp10.000.000 → kategori A. Tunjangan T harus = TER(10 jt + T) × (10 jt + T).
  const { allowance, tax } = grossUpAllowance(t => monthlyTerTax(10_000_000 + t, 'K0', ref).tax)
  assert.equal(tax, monthlyTerTax(10_000_000 + allowance, 'K0', ref).tax)
  assert.ok(tax <= allowance)
  assert.ok(allowance > monthlyTerTax(10_000_000, 'K0', ref).tax)
})

test('gross-up of a non-taxable wage stays zero', () => {
  assert.deepEqual(grossUpAllowance(t => monthlyTerTax(4_000_000 + t, 'TK0', ref).tax), { allowance: 0, tax: 0 })
})

test('gross-up resolves oscillation at a TER band edge with a covering allowance', () => {
  for (let gross = 5_300_000; gross <= 5_700_000; gross += 7_919) {
    const { allowance, tax } = grossUpAllowance(t => monthlyTerTax(gross + t, 'TK0', ref).tax)
    assert.ok(tax <= allowance, `gross ${gross}: tax ${tax} > allowance ${allowance}`)
  }
})
