import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SELF_ABILITIES,
  TENANT_ABILITIES,
  TENANT_ROLES,
  abilitiesFor,
  canTenantRole
} from '../shared/utils/tenant-abilities'

// Matriks peran × kemampuan (04-rbac.md §2.4).

test('employee holds exactly the self abilities', () => {
  const allowed = TENANT_ABILITIES.filter(ability => canTenantRole('employee', ability))
  assert.deepEqual([...allowed].sort(), [...SELF_ABILITIES].sort())
})

test('owner holds every ability', () => {
  for (const ability of TENANT_ABILITIES) assert.ok(canTenantRole('owner', ability), ability)
})

test('hr_admin cannot touch billing, account or team', () => {
  for (const ability of ['billing.manage', 'account.manage', 'team.manage'] as const) {
    assert.equal(canTenantRole('hr_admin', ability), false, ability)
  }
  assert.ok(canTenantRole('hr_admin', 'payroll.write'))
  assert.ok(canTenantRole('hr_admin', 'employees.sensitive.read'))
})

test('manager never sees payroll or sensitive employee data', () => {
  for (const ability of ['payroll.read', 'payroll.write', 'employees.sensitive.read', 'employees.write', 'billing.manage'] as const) {
    assert.equal(canTenantRole('manager', ability), false, ability)
  }
  assert.ok(canTenantRole('manager', 'leave.approve'))
})

test('every non-owner role keeps the self abilities for its own ESS pages', () => {
  for (const role of TENANT_ROLES) {
    for (const ability of SELF_ABILITIES) assert.ok(canTenantRole(role, ability), `${role} ${ability}`)
  }
})

test('missing role is denied everything', () => {
  for (const ability of TENANT_ABILITIES) assert.equal(canTenantRole(null, ability), false)
})

test('abilitiesFor returns a copy', () => {
  const list = abilitiesFor('employee')
  list.push('billing.manage')
  assert.equal(canTenantRole('employee', 'billing.manage'), false)
})
