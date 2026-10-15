import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decrypt, encrypt, isEncrypted, maskIdentifier, sha256 } from '../server/utils/crypto'
import { normalizeIndonesianPhone, isValidIndonesianPhone } from '../shared/utils/phone'
import { FEATURE_KEYS, LIMIT_KEYS, SEED_PLANS, normalizeFeatures, normalizeLimits } from '../shared/utils/plans'
import { safeRedirectPath } from '../shared/utils/auth-rules'
import { flattenMenuTree } from '../shared/utils/menus'
import { PERMISSION_KEYS } from '../shared/utils/permissions'

process.env.SETTINGS_SECRET = 'test-settings-secret'
process.env.HR_DATA_KEY = 'test-hr-key'

test('encrypt/decrypt round-trips and keys are separated', () => {
  const cipher = encrypt('3201010101010001', 'hr')
  assert.ok(isEncrypted(cipher))
  assert.equal(decrypt(cipher, 'hr'), '3201010101010001')
  assert.equal(decrypt(cipher, 'settings'), '', 'wrong key must not decrypt')
  assert.equal(decrypt('plain-value'), 'plain-value')
})

test('identifier masking keeps only the edges', () => {
  assert.equal(maskIdentifier('3201010101010001'), '3201••••••••0001')
  assert.equal(sha256('a').length, 64)
})

test('phone normalization', () => {
  assert.equal(normalizeIndonesianPhone('0812-3456-7890'), '6281234567890')
  assert.equal(normalizeIndonesianPhone('+62 812 3456 7890'), '6281234567890')
  assert.ok(isValidIndonesianPhone('081234567890'))
  assert.equal(isValidIndonesianPhone('12345'), false)
})

test('plan normalizers fill new keys conservatively', () => {
  const limits = normalizeLimits({ employees: 50, unknown: 3 })
  assert.equal(limits.employees, 50)
  assert.equal(limits.branches, 1)
  const features = normalizeFeatures({ payroll: true, export: 'yes' })
  assert.equal(features.payroll, true)
  assert.equal(features.export, false)
})

test('seed plans define every limit and feature key', () => {
  for (const plan of SEED_PLANS) {
    assert.deepEqual(Object.keys(plan.limits).sort(), [...LIMIT_KEYS].sort(), plan.slug)
    assert.deepEqual(Object.keys(plan.features).sort(), [...FEATURE_KEYS].sort(), plan.slug)
  }
})

test('redirect targets must be same-origin paths', () => {
  assert.equal(safeRedirectPath('/app/employees', '/x'), '/app/employees')
  assert.equal(safeRedirectPath('//evil.com', '/x'), '/x')
  assert.equal(safeRedirectPath('https://evil.com', '/x'), '/x')
})

test('admin menu rows reference known permissions and stay within depth 3', () => {
  const rows = flattenMenuTree()
  const byId = new Map(rows.map(r => [r.id, r]))
  for (const row of rows) {
    if (row.permissionKey) assert.ok((PERMISSION_KEYS as string[]).includes(row.permissionKey), row.slug)
    let depth = 1
    let parent = row.parentId
    while (parent) {
      depth++
      parent = byId.get(parent)?.parentId ?? null
    }
    assert.ok(depth <= 3, row.slug)
  }
})
