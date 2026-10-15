import { findMock } from '../../../dev-hub/store'

// MOCK halaman pembayaran (dev). Tombol mensimulasikan hasil dari gateway.
function actionButton(ref: string, action: string, label: string, color: string): string {
  return `<form method="post" action="/_dev-hub/pay/${ref}/${action}" style="display:inline">`
    + `<button style="background:${color};color:#fff;border:0;border-radius:6px;padding:10px 16px;font-weight:600;cursor:pointer;margin:4px">${label}</button></form>`
}

export default defineEventHandler((event) => {
  if (process.env.NODE_ENV === 'production') throw createError({ statusCode: 404 })
  const ref = getRouterParam(event, 'ref') ?? ''
  const tx = findMock(ref)
  if (!tx) throw createError({ statusCode: 404, statusMessage: 'Unknown checkout.' })
  const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(tx.amount)
  const actions = tx.status === 'pending'
    ? actionButton(ref, 'pay', 'Bayar (sukses)', '#16a34a') + actionButton(ref, 'fail', 'Gagal', '#dc2626') + actionButton(ref, 'expire', 'Kedaluwarsa', '#64748b')
    : '<p>Checkout ini sudah selesai.</p>'
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  return [
    '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mock Payment Hub</title></head>',
    '<body style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f1f5f9;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">',
    '<div style="background:#fff;border-radius:10px;padding:28px;max-width:420px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,.08)">',
    '<p style="margin:0;color:#b45309;font-size:12px;font-weight:600">MOCK PAYMENT HUB — DEVELOPMENT ONLY</p>',
    `<h1 style="font-size:20px;margin:8px 0">${rupiah}</h1>`,
    `<p style="color:#475569;font-size:14px;margin:0 0 4px">Referensi: <code>${tx.reference}</code></p>`,
    `<p style="color:#475569;font-size:14px;margin:0 0 16px">Status: <strong>${tx.status}</strong></p>`,
    actions,
    '</div></body></html>'
  ].join('')
})
