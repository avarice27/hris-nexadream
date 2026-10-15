import { findMock } from '../../../../dev-hub/store'

// MOCK hasil pembayaran (dev): ubah status, kirim callback gaya Midtrans ke webhook platform
// (payload mentah, tidak bisa diverifikasi platform), lalu redirect ke finishUrl dengan parameter hub.
const OUTCOMES = {
  pay: { status: 'paid', gatewayStatus: 'settlement', result: 'finish', code: '200' },
  fail: { status: 'failed', gatewayStatus: 'deny', result: 'error', code: '202' },
  expire: { status: 'expired', gatewayStatus: 'expire', result: 'error', code: '407' }
} as const

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') throw createError({ statusCode: 404 })
  const ref = getRouterParam(event, 'ref') ?? ''
  const outcome = OUTCOMES[getRouterParam(event, 'action') as keyof typeof OUTCOMES]
  const tx = findMock(ref)
  if (!tx || !outcome) throw createError({ statusCode: 404 })
  const origin = getRequestURL(event).origin

  if (tx.status === 'pending') {
    tx.status = outcome.status
    tx.gatewayStatus = outcome.gatewayStatus
    if (outcome.status === 'paid') {
      tx.paymentType = 'qris'
      tx.settlementTime = new Date().toISOString()
    }
    // Kegagalan callback diabaikan — rekonsiliasi/halaman kembali akan menyusul.
    await fetch(`${origin}/api/webhooks/payments/nexadream_hub`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        order_id: tx.orderId,
        transaction_status: tx.gatewayStatus,
        status_code: outcome.code,
        transaction_id: `mock-${tx.reference}`,
        gross_amount: `${tx.amount}.00`,
        payment_type: tx.paymentType ?? 'qris',
        signature_key: 'unverifiable-on-the-platform'
      })
    }).catch(() => {})
  }

  const finish = new URL(tx.finishUrl ?? `${origin}/app/billing`)
  finish.searchParams.set('reference', tx.reference)
  finish.searchParams.set('result', outcome.result)
  finish.searchParams.set('status', tx.status)
  finish.searchParams.set('transaction_status', tx.gatewayStatus)
  finish.searchParams.set('status_code', outcome.code)
  return sendRedirect(event, finish.toString(), 303)
})
