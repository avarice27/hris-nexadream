import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CSV_BOM, parseCsv, toCsv } from '../shared/utils/csv'
import { isValidNik, COUNTED_EMPLOYMENT_STATUSES, DEFAULT_LEAVE_TYPES } from '../shared/utils/hr'
import { dateKeysBetween, weekdayOfKey, zonedInstant, zonedTimeLabel } from '../shared/utils/timezone'
import { TENANT_NAV, ESS_NAV } from '../shared/utils/menus'
import { canTenantRole } from '../shared/utils/tenant-abilities'

test('toCsv: semicolon, BOM, quoting and formula-injection guard', () => {
  const csv = toCsv(['Nama', 'Catatan'], [['Budi; Santoso', '=HYPERLINK("x")'], ['Ani', '-5'], ['"Q"', null]])
  assert.ok(csv.startsWith(CSV_BOM))
  const lines = csv.slice(1).trim().split('\r\n')
  assert.equal(lines[0], 'Nama;Catatan')
  assert.equal(lines[1], '"Budi; Santoso";"\'=HYPERLINK(""x"")"')
  assert.equal(lines[2], 'Ani;-5')
  assert.equal(lines[3], '"""Q""";')
})

test('parseCsv detects ; or , and handles quotes, BOM and blank lines', () => {
  assert.deepEqual(parseCsv(`${CSV_BOM}a;b\r\n1;"x;y"\r\n\r\n2;"he said ""hi"""\n`), [['a', 'b'], ['1', 'x;y'], ['2', 'he said "hi"']])
  assert.deepEqual(parseCsv('a,b\n1,"2,5"'), [['a', 'b'], ['1', '2,5']])
  // round trip
  const rows = [['NIP', 'Nama'], ['EMP-1', 'Siti; "Rahma"']]
  assert.deepEqual(parseCsv(toCsv(rows[0]!, [rows[1]!])), rows)
})

test('HR identifiers and catalogs', () => {
  assert.equal(isValidNik('3174011201900001'), true)
  assert.equal(isValidNik('317401120190000'), false)
  assert.deepEqual(COUNTED_EMPLOYMENT_STATUSES, ['active', 'probation', 'on_leave'])
  const annual = DEFAULT_LEAVE_TYPES.find(t => t.code === 'ANNUAL')!
  assert.equal(annual.annualDays, 12)
  assert.equal(annual.eligibleAfterMonths, 12)
})

test('branch-local time helpers (WIB/WITA/WIT, no DST)', () => {
  assert.equal(zonedInstant('2026-10-15', '08:00', 'Asia/Jakarta').toISOString(), '2026-10-15T01:00:00.000Z')
  assert.equal(zonedInstant('2026-10-15', '08:00', 'Asia/Makassar').toISOString(), '2026-10-15T00:00:00.000Z')
  assert.equal(zonedInstant('2026-10-15', '08:00', 'Asia/Jayapura').toISOString(), '2026-10-14T23:00:00.000Z')
  assert.equal(zonedTimeLabel(new Date('2026-10-15T01:05:00Z'), 'Asia/Jakarta'), '08:05')
  assert.equal(weekdayOfKey('2026-10-15'), 4)
  assert.deepEqual(dateKeysBetween('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
})

test('navigation entries match role abilities', () => {
  // Karyawan tidak melihat menu konsol yang butuh kemampuan manajemen.
  const employeeConsole = TENANT_NAV.filter(i => i.ability && canTenantRole('employee', i.ability)).map(i => i.to)
  assert.deepEqual(employeeConsole, ['/app/me'])
  // Atasan melihat persetujuan, bukan payroll.
  assert.equal(TENANT_NAV.some(i => i.to === '/app/approvals' && canTenantRole('manager', i.ability!)), true)
  assert.equal(TENANT_NAV.some(i => i.to === '/app/payroll' && canTenantRole('manager', i.ability!)), false)
  // Semua entri ESS terbuka untuk peran employee.
  assert.ok(ESS_NAV.every(i => !i.ability || canTenantRole('employee', i.ability)))
})
