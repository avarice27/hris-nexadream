import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EMAIL_TEMPLATES, NOTIFICATION_TEMPLATES, COMMON_EMAIL_VARIABLES, renderTemplateString } from '../shared/utils/templates'
import { absolutizeLinks, htmlToText, wrapEmailHtml } from '../shared/utils/email-brand'
import { addDaysToKey, startOfZonedDay, zonedDateKey } from '../shared/utils/timezone'

test('renderer fills tokens, blanks unknowns and escapes when asked', () => {
  assert.equal(renderTemplateString('Halo {{name}}{{missing}}', { name: 'Budi' }), 'Halo Budi')
  assert.equal(renderTemplateString('{{x}}', { x: '<b>' }, true), '&lt;b&gt;')
})

test('optional blocks render only when the variable has a value', () => {
  const source = 'Ditolak.{{#reason}} Alasan: {{reason}}{{/reason}}'
  assert.equal(renderTemplateString(source, { reason: 'Audit' }), 'Ditolak. Alasan: Audit')
  assert.equal(renderTemplateString(source, { reason: '' }), 'Ditolak.')
})

test('every catalog token is declared as a variable', () => {
  const check = (key: string, sources: string[], declared: string[]) => {
    const known = new Set([...declared, ...COMMON_EMAIL_VARIABLES.map(v => v.token)])
    for (const source of sources) {
      for (const match of source.matchAll(/\{\{\s*[#/]?\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
        assert.ok(known.has(match[1]!), `${key}: {{${match[1]}}} not declared`)
      }
    }
  }
  for (const t of EMAIL_TEMPLATES) check(t.key, [t.subject, t.body], t.variables.map(v => v.token))
  for (const t of NOTIFICATION_TEMPLATES) check(t.key, [t.title, t.body, t.actionUrl ?? ''], t.variables.map(v => v.token))
})

test('template keys are unique', () => {
  for (const list of [EMAIL_TEMPLATES, NOTIFICATION_TEMPLATES]) {
    const keys = list.map(t => t.key)
    assert.equal(new Set(keys).size, keys.length)
  }
})

test('payslip copy never carries an amount variable (D7)', () => {
  const payslip = [...EMAIL_TEMPLATES, ...NOTIFICATION_TEMPLATES].filter(t => t.key === 'payslip_published')
  for (const t of payslip) assert.ok(!t.variables.some(v => /amount|salary|net|gross/i.test(v.token)), t.key)
})

test('brand wrapper absolutizes root-relative links only', () => {
  const html = absolutizeLinks('<a href="/app/x">a</a><a href="//cdn/x">b</a><a href="mailto:x@y">c</a>', 'https://hris.nexadream.id/')
  assert.ok(html.includes('href="https://hris.nexadream.id/app/x"'))
  assert.ok(html.includes('href="//cdn/x"'))
  assert.ok(html.includes('href="mailto:x@y"'))
  const wrapped = wrapEmailHtml('<p>Hi</p>', { appName: 'HRIS Nexadream', siteUrl: 'https://s', supportEmail: 's@x', companyName: 'Nexadream' }, 'Subj')
  assert.ok(wrapped.includes('<p>Hi</p>') && wrapped.includes('s@x'))
  assert.equal(htmlToText('<p>Halo</p><p><a href="https://x/y">Buka</a></p>'), 'Halo\nBuka (https://x/y)')
})

test('zoned day boundaries for WIB/WITA/WIT', () => {
  assert.equal(startOfZonedDay('2026-10-15', 'Asia/Jakarta').toISOString(), '2026-10-14T17:00:00.000Z')
  assert.equal(startOfZonedDay('2026-10-15', 'Asia/Makassar').toISOString(), '2026-10-14T16:00:00.000Z')
  assert.equal(startOfZonedDay('2026-10-15', 'Asia/Jayapura').toISOString(), '2026-10-14T15:00:00.000Z')
  assert.equal(zonedDateKey(new Date('2026-10-14T17:30:00Z'), 'Asia/Jakarta'), '2026-10-15')
  assert.equal(addDaysToKey('2026-12-31', 1), '2027-01-01')
})
