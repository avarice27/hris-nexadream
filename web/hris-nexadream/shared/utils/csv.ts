// CSV untuk ekspor/impor (18 §1.7): pemisah ';' + BOM UTF-8 agar Excel versi Indonesia
// membukanya rapi. Parser menerima ';' atau ',' (dideteksi dari baris judul) dan tanda kutip ganda.

export const CSV_BOM = String.fromCharCode(0xFEFF)

function escapeCell(value: unknown, delimiter: string): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  // Cegah injeksi formula spreadsheet (=, +, -, @ di awal sel).
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text
  return /["\n\r]/.test(safe) || safe.includes(delimiter) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(headers: string[], rows: unknown[][], delimiter = ';'): string {
  const lines = [headers, ...rows].map(row => row.map(cell => escapeCell(cell, delimiter)).join(delimiter))
  return CSV_BOM + lines.join('\r\n') + '\r\n'
}

export function parseCsv(input: string): string[][] {
  const text = input.startsWith(CSV_BOM) ? input.slice(1) : input
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some(c => c.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  row.push(cell)
  if (row.some(c => c.trim() !== '')) rows.push(row)
  return rows.map(r => r.map(c => c.trim()))
}
