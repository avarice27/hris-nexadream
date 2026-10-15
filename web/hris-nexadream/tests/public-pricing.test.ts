import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEED_PLANS, UNLIMITED, addedFeatures, isCustomPricedPlan, yearlySaving } from '../shared/utils/plans'

const bySlug = (slug: string) => SEED_PLANS.find(p => p.slug === slug)!

test('isCustomPricedPlan: only zero-priced plans with unlimited employees are "Hubungi kami"', () => {
  assert.equal(isCustomPricedPlan(bySlug('enterprise')), true)
  assert.equal(isCustomPricedPlan(bySlug('free')), false)
  assert.equal(isCustomPricedPlan(bySlug('growth')), false)
  // Paket berbayar tanpa batas tetap menampilkan harga
  assert.equal(isCustomPricedPlan({ priceMonthly: 999000, priceYearly: 0, limits: { employees: UNLIMITED } }), false)
})

test('yearlySaving compares against 12x monthly and never goes negative', () => {
  assert.deepEqual(yearlySaving({ priceMonthly: 199000, priceYearly: 1990000 }), { amount: 398000, percent: 17 })
  assert.deepEqual(yearlySaving({ priceMonthly: 100000, priceYearly: 1200000 }), { amount: 0, percent: 0 })
  assert.deepEqual(yearlySaving({ priceMonthly: 100000, priceYearly: 1500000 }), { amount: 0, percent: 0 })
  assert.deepEqual(yearlySaving({ priceMonthly: 100000, priceYearly: 0 }), { amount: 0, percent: 0 })
})

test('addedFeatures lists only what the plan adds over the previous one', () => {
  const free = bySlug('free')
  const growth = bySlug('growth')
  const added = addedFeatures(growth, free)
  assert.ok(added.length > 0)
  for (const key of added) {
    assert.equal(growth.features[key], true)
    assert.equal(free.features[key], false)
  }
  // Tanpa paket sebelumnya: semua fitur aktif
  assert.deepEqual(addedFeatures(free), Object.keys(free.features).filter(k => free.features[k as keyof typeof free.features]))
})
