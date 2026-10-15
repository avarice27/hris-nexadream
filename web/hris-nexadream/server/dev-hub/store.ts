import type { H3Event } from 'h3'

// MOCK Payment Hub — HANYA development. Meniru kontrak https://nexadream.id/docs/payment-hub agar
// driver asli, webhook, dan halaman langganan bisa diuji tanpa kredensial hub. 404 di produksi.
// Penyimpanan di memori (satu proses dev).

export interface MockTransaction {
  orderId: string
  reference: string
  amount: number
  currency: string
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled'
  gatewayStatus: string
  paymentType: string | null
  settlementTime: string | null
  finishUrl: string | null
  metadata: Record<string, unknown> | null
  expiresAt: number
  createdAt: number
}

export const MOCK_PREFIX = 'HRN'

const store = globalThis as unknown as { __mockHub?: Map<string, MockTransaction> }
export const mockTransactions = store.__mockHub ??= new Map<string, MockTransaction>()

export function assertDevHub(event: H3Event) {
  if (process.env.NODE_ENV === 'production') throw createError({ statusCode: 404 })
  const auth = getRequestHeader(event, 'authorization') ?? ''
  return auth
}

export function requireMockKey(event: H3Event) {
  const auth = assertDevHub(event)
  if (!/^Bearer \S+/.test(auth)) throw createError({ statusCode: 401, statusMessage: 'Missing or unrecognised API key.' })
}

export function findMock(ref: string): MockTransaction | undefined {
  const tx = mockTransactions.get(ref) ?? [...mockTransactions.values()].find(t => t.orderId === ref)
  if (tx && tx.status === 'pending' && tx.expiresAt < Date.now()) {
    tx.status = 'expired'
    tx.gatewayStatus = 'expire'
  }
  return tx
}

export function toHubJson(tx: MockTransaction, extra: Record<string, unknown> = {}) {
  return {
    orderId: tx.orderId,
    reference: tx.reference,
    status: tx.status,
    gatewayStatus: tx.gatewayStatus,
    amount: tx.amount,
    currency: tx.currency,
    paymentType: tx.paymentType,
    settlementTime: tx.settlementTime,
    metadata: tx.metadata,
    source: 'gateway',
    ...extra
  }
}
