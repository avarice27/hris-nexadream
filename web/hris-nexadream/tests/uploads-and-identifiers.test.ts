import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sniffContentType, stripJpegMetadata, UPLOAD_PURPOSES, formatBytes } from '../shared/utils/uploads'
import { formatNpwp, isValidNpwp } from '../shared/utils/identifiers'

function jpegWithExif(): Uint8Array {
  const app0 = [0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const payload = [...Buffer.from('Exif\0\0GPS-SECRET')]
  const app1 = [0xFF, 0xE1, 0x00, payload.length + 2, ...payload]
  const sos = [0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x12, 0x34, 0xFF, 0xD9]
  return Uint8Array.from([0xFF, 0xD8, ...app0, ...app1, ...sos])
}

test('magic-byte sniffing ignores names and rejects SVG/HTML', () => {
  assert.equal(sniffContentType(jpegWithExif()), 'image/jpeg')
  assert.equal(sniffContentType(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0])), 'image/png')
  assert.equal(sniffContentType(new TextEncoder().encode('%PDF-1.7')), 'application/pdf')
  assert.equal(sniffContentType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), null)
  assert.equal(sniffContentType(new TextEncoder().encode('<html>')), null)
})

test('JPEG metadata (EXIF/GPS) is stripped, JFIF and image data kept', () => {
  const stripped = Buffer.from(stripJpegMetadata(jpegWithExif()))
  assert.equal(stripped.includes('GPS-SECRET'), false)
  assert.equal(stripped.includes('JFIF'), true)
  assert.equal(stripped[stripped.length - 1], 0xD9)
  assert.equal(sniffContentType(stripped), 'image/jpeg')
})

test('malformed JPEG is returned unchanged rather than corrupted', () => {
  const broken = Uint8Array.from([0xFF, 0xD8, 0x00, 0x01, 0x02])
  assert.deepEqual(stripJpegMetadata(broken), broken)
})

test('upload purposes: documents are private, no purpose allows SVG', () => {
  assert.equal(UPLOAD_PURPOSES.document.visibility, 'private')
  for (const def of Object.values(UPLOAD_PURPOSES)) assert.ok(!(def.allowedTypes as readonly string[]).includes('image/svg+xml'))
  assert.equal(formatBytes(512 * 1024), '512 KB')
})

test('NPWP accepts 15 and 16 digits, formats the 15-digit form', () => {
  assert.ok(isValidNpwp('01.234.567.8-901.000'))
  assert.ok(isValidNpwp('3201010101010001'))
  assert.equal(isValidNpwp('12345'), false)
  assert.equal(formatNpwp('012345678901000'), '01.234.567.8-901.000')
})
