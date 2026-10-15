import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSubscriptionDue, periodEnd, renewalBase, subscriptionGrantsPlan } from '../shared/utils/billing-rules'
import { isAwaitingPayment, PAYMENT_PROVIDERS } from '../shared/utils/payments'

const d = (iso: string) => new Date(iso)
const now = d('2026-10-15T08:00:00Z')

test('periodEnd adds months in UTC and clamps month ends', () => {
  assert.equal(periodEnd(d('2026-10-15T08:00:00Z'), 'monthly').toISOString(), '2026-11-15T08:00:00.000Z')
  assert.equal(periodEnd(d('2026-01-31T00:00:00Z'), 'monthly').toISOString(), '2026-02-28T00:00:00.000Z')
  assert.equal(periodEnd(d('2028-01-31T00:00:00Z'), 'monthly').toISOString(), '2028-02-29T00:00:00.000Z')
  assert.equal(periodEnd(d('2026-10-15T08:00:00Z'), 'yearly').toISOString(), '2027-10-15T08:00:00.000Z')
})

test('paying early stacks onto the remaining time', () => {
  assert.equal(renewalBase(d('2026-11-01T00:00:00Z'), now).toISOString(), '2026-11-01T00:00:00.000Z')
  assert.equal(renewalBase(d('2026-10-01T00:00:00Z'), now), now)
  assert.equal(renewalBase(null, now), now)
})

test('an abandoned early renewal is not a default', () => {
  assert.equal(isSubscriptionDue({ status: 'active', trialEndsAt: null, currentPeriodEnd: d('2026-11-01T00:00:00Z') }, now), false)
  assert.equal(isSubscriptionDue({ status: 'active', trialEndsAt: null, currentPeriodEnd: d('2026-10-01T00:00:00Z') }, now), true)
  assert.equal(isSubscriptionDue({ status: 'trialing', trialEndsAt: d('2026-10-20T00:00:00Z'), currentPeriodEnd: null }, now), false)
  assert.equal(isSubscriptionDue({ status: 'past_due', trialEndsAt: null, currentPeriodEnd: null }, now), true)
  assert.equal(isSubscriptionDue({ status: 'downgraded', trialEndsAt: null, currentPeriodEnd: null }, now), false)
})

test('which statuses grant the plan right now', () => {
  assert.ok(subscriptionGrantsPlan({ status: 'trialing', trialEndsAt: d('2026-10-20T00:00:00Z'), currentPeriodEnd: null }, now))
  assert.ok(!subscriptionGrantsPlan({ status: 'trialing', trialEndsAt: d('2026-10-01T00:00:00Z'), currentPeriodEnd: null }, now))
  assert.ok(subscriptionGrantsPlan({ status: 'cancelled', trialEndsAt: null, currentPeriodEnd: d('2026-11-01T00:00:00Z') }, now))
  assert.ok(!subscriptionGrantsPlan({ status: 'cancelled', trialEndsAt: null, currentPeriodEnd: d('2026-10-01T00:00:00Z') }, now))
  assert.ok(subscriptionGrantsPlan({ status: 'past_due', trialEndsAt: null, currentPeriodEnd: null, graceEndsAt: d('2026-10-18T00:00:00Z') }, now))
  assert.ok(!subscriptionGrantsPlan({ status: 'suspended', trialEndsAt: null, currentPeriodEnd: d('2027-01-01T00:00:00Z') }, now))
})

test('awaiting payment = pending/challenge and not expired', () => {
  assert.ok(isAwaitingPayment({ status: 'pending', expiresAt: d('2026-10-15T09:00:00Z') }, now))
  assert.ok(!isAwaitingPayment({ status: 'pending', expiresAt: d('2026-10-15T07:00:00Z') }, now))
  assert.ok(!isAwaitingPayment({ status: 'paid', expiresAt: null }, now))
})

test('hub catalog requires key, address and order prefix; key is secret', () => {
  const hub = PAYMENT_PROVIDERS.find(p => p.value === 'nexadream_hub')!
  assert.deepEqual(hub.fields.map(f => f.key).sort(), ['baseUrl', 'orderPrefix', 'serverKey'])
  assert.ok(hub.fields.find(f => f.key === 'serverKey')!.secret)
  assert.equal(hub.supportsRecurring, false)
})
