import { PAYMENT_STATUSES, type PaymentStatusValue } from '#shared/utils/payments'
import type { CancelChargeResult, CreateChargeResult, GatewayCredentials, NormalizedPayment, PaymentDriver, WebhookPayload } from './types'

// Driver Nexadream Payment Hub — SATU-SATUNYA file yang tahu host, path, dan nama field hub.
// Dokumentasi: https://nexadream.id/docs/payment-hub (dokumentasi hub menang bila berbeda).
//
// Hub meminjamkan satu akun merchant ke beberapa platform. Callback adalah payload mentah gateway
// yang ditandatangani rahasia yang tidak kita punya → trustsWebhookPayload = false; status selalu
// dikonfirmasi lewat GET transaksi. Callback untuk pesanan platform lain akan datang: wajar.

interface HubTransaction {
  orderId?: string
  reference?: string
  status?: string
  gatewayStatus?: string
  amount?: number | string
  currency?: string
  paymentType?: string | null
  settlementTime?: string | null
  redirectUrl?: string
  token?: string | null
  clientKey?: string | null
  reused?: boolean
  alreadyCancelled?: boolean
  source?: string
  statusMessage?: string
  [key: string]: unknown
}

function baseUrl(creds: GatewayCredentials): string {
  const base = (creds.baseUrl ?? '').trim().replace(/\/+$/, '')
  if (!base) throw httpError(503, 'INTERNAL', 'Alamat Payment Hub belum diatur. Hubungi tim dukungan.')
  return base
}

/** Kesalahan hub → kesalahan kita. Pesan hub hanya ke log, tidak ke pengguna. */
async function hubRequest(creds: GatewayCredentials, path: string, init: RequestInit = {}): Promise<HubTransaction> {
  let response: Response
  try {
    response = await fetch(`${baseUrl(creds)}/api/hub/v1/transactions${path}`, {
      ...init,
      headers: {
        'authorization': `Bearer ${creds.serverKey}`,
        'accept': 'application/json',
        'content-type': 'application/json',
        ...(init.headers as Record<string, string> | undefined)
      },
      signal: AbortSignal.timeout(15_000)
    })
  } catch (error) {
    console.error('[payments:hub] network error', path, error)
    throw httpError(502, 'INTERNAL', 'Gateway pembayaran tidak dapat dihubungi. Coba lagi sebentar lagi.')
  }
  const body = await response.json().catch(() => ({})) as HubTransaction
  if (response.ok) return body

  console.error('[payments:hub] request failed', response.status, path, body?.statusMessage)
  switch (response.status) {
    case 404: throw httpError(404, 'NOT_FOUND', 'Pembayaran tidak ditemukan di gateway.')
    case 409: throw httpError(409, 'CONFLICT', 'Pembayaran ini sudah diproses gateway dan tidak bisa dibatalkan.')
    case 501: throw httpError(501, 'INTERNAL', 'Gateway pembayaran tidak mendukung pembatalan.')
    case 401:
    case 403: throw httpError(503, 'INTERNAL', 'Pembayaran sedang tidak tersedia. Hubungi tim dukungan.')
    default: throw httpError(502, 'INTERNAL', 'Gateway pembayaran menolak permintaan. Coba lagi sebentar lagi.')
  }
}

function toStatus(value?: string): PaymentStatusValue {
  const s = String(value ?? '').toLowerCase()
  // Kata yang tidak dikenal = "belum ada uang".
  return (PAYMENT_STATUSES as readonly string[]).includes(s) ? s as PaymentStatusValue : 'pending'
}

function toReference(tx: HubTransaction, creds: GatewayCredentials): string {
  if (tx.reference) return tx.reference
  const prefix = (creds.orderPrefix ?? '').trim()
  const id = tx.orderId ?? ''
  return prefix && id.startsWith(`${prefix}-`) ? id.slice(prefix.length + 1) : id
}

function normalize(tx: HubTransaction, creds: GatewayCredentials): NormalizedPayment {
  const status = toStatus(tx.status)
  return {
    orderId: toReference(tx, creds),
    status,
    rawStatus: tx.gatewayStatus || tx.status || 'unknown',
    amount: Math.round(Number(tx.amount ?? 0)),
    currency: String(tx.currency ?? 'IDR'),
    paymentType: tx.paymentType ?? null,
    paidAt: status === 'paid' && tx.settlementTime ? new Date(tx.settlementTime) : null,
    raw: tx
  }
}

const str = (value: unknown): string | null => value === null || value === undefined || value === '' ? null : String(value)

export const nexadreamHubDriver: PaymentDriver = {
  provider: 'nexadream_hub',
  trustsWebhookPayload: false,

  async createCharge(creds, input): Promise<CreateChargeResult> {
    const expiryMinutes = input.expiresAt
      ? Math.min(43200, Math.max(1, Math.round((input.expiresAt.getTime() - Date.now()) / 60000)))
      : 60
    const tx = await hubRequest(creds, '', {
      method: 'POST',
      body: JSON.stringify({
        reference: input.orderId,
        amount: input.amount,
        currency: input.currency,
        customer: {
          firstName: input.customer.name.slice(0, 50),
          ...(input.customer.email ? { email: input.customer.email } : {}),
          ...(input.customer.phone ? { phone: input.customer.phone } : {})
        },
        // Hub mewajibkan jumlah item = amount → satu baris penuh.
        items: [{ id: 'subscription', name: input.itemName.slice(0, 50), price: input.amount, quantity: 1 }],
        finishUrl: input.successUrl,
        // Hanya id/slug — tidak pernah data pribadi karyawan (D7).
        metadata: input.metadata,
        expiryMinutes
      })
    })
    if (!tx.redirectUrl) {
      console.error('[payments:hub] create returned no redirectUrl', tx)
      throw httpError(502, 'INTERNAL', 'Gateway tidak mengembalikan halaman pembayaran. Coba lagi sebentar lagi.')
    }
    return {
      orderId: tx.reference ?? input.orderId,
      gatewayOrderId: tx.orderId,
      redirectUrl: tx.redirectUrl,
      token: tx.token ?? null,
      clientKey: tx.clientKey ?? null,
      expiresAt: input.expiresAt,
      reused: !!tx.reused,
      raw: tx
    }
  },

  async createSubscription() {
    throw httpError(501, 'INTERNAL', 'Payment Hub tidak mendukung tagihan berulang.')
  },

  async cancelSubscription() {
    // Tidak ada mandat di hulu yang perlu dibatalkan.
  },

  async cancelCharge(creds, orderId): Promise<CancelChargeResult> {
    const tx = await hubRequest(creds, `/${encodeURIComponent(orderId)}/cancel`, { method: 'POST' })
    return { ...normalize(tx, creds), alreadyCancelled: !!tx.alreadyCancelled }
  },

  async getStatus(creds, orderId) {
    // Selalu dengan referensi KITA, bukan id berprefiks.
    return normalize(await hubRequest(creds, `/${encodeURIComponent(orderId)}`), creds)
  },

  verifyWebhook() {
    return false // tidak pernah dipanggil (trustsWebhookPayload = false)
  },

  normalizeWebhook() {
    throw new Error('nexadream_hub callbacks are never trusted; use getStatus().')
  },

  // Payload gateway mentah (mis. Midtrans) sampai ke kita tanpa diubah → nama field-nya:
  webhookOrderId: (p: WebhookPayload) => str(p.order_id ?? p.external_id ?? p.id),
  webhookDedupeSource: (p: WebhookPayload) => [
    p.order_id ?? p.external_id ?? p.id,
    p.transaction_status ?? p.status,
    p.transaction_id ?? p.status_code ?? ''
  ].join(':'),
  webhookStatus: (p: WebhookPayload) => str(p.transaction_status ?? p.status),
  // Hub menambahkan referensi KITA pada redirect.
  redirectOrderId: (q: Record<string, unknown>) => str(q.reference ?? q.order_id)
}
