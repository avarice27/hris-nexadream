import type { PaymentStatusValue } from '#shared/utils/payments'

// Kontrak driver pembayaran — SATU-SATUNYA tempat kode bisnis mengimpor tipe pembayaran.

export interface GatewayCredentials {
  provider: string
  /** didekripsi di titik pemanggilan; hub: kunci API platform */
  serverKey: string
  clientKey: string
  merchantId?: string | null
  baseUrl?: string | null
  /** prefiks yang diterbitkan hub untuk platform ini */
  orderPrefix?: string | null
  isSandbox: boolean
  config?: Record<string, unknown> | null
}

export interface ChargeCustomer { name: string, email?: string | null, phone?: string | null }

export interface CreateChargeInput {
  /** nomor pesanan KITA */
  orderId: string
  /** bilangan bulat, satuan terkecil */
  amount: number
  currency: string
  itemName: string
  customer: ChargeCustomer
  successUrl: string
  failureUrl: string
  expiresAt?: Date
  metadata?: Record<string, unknown>
}

export interface CreateChargeResult {
  orderId: string
  /** id yang dilihat gateway (hub: PREFIX-orderId) — dipakai callback */
  gatewayOrderId?: string
  redirectUrl: string
  token?: string | null
  clientKey?: string | null
  expiresAt?: Date
  /** hub mengembalikan checkout lama untuk referensi yang sama */
  reused?: boolean
  raw?: Record<string, unknown>
}

export interface NormalizedPayment {
  /** nomor pesanan KITA */
  orderId: string
  status: PaymentStatusValue
  rawStatus: string
  amount: number
  currency: string
  paymentType?: string | null
  paidAt?: Date | null
  raw?: Record<string, unknown>
}

export interface CancelChargeResult extends NormalizedPayment { alreadyCancelled: boolean }

export interface CreateSubscriptionInput {
  name: string
  amount: number
  currency: string
  period: 'monthly' | 'yearly'
  customer: ChargeCustomer
  paymentToken: string
  startAt?: Date
  metadata?: Record<string, unknown>
}

export interface SubscriptionResult { providerRef: string, status: string, raw?: Record<string, unknown> }

export type WebhookPayload = Record<string, unknown>

export interface PaymentDriver {
  readonly provider: string
  /** true: rahasia bersama → verifikasi lalu terapkan payload. false: nudge tak bertanda tangan → getStatus(). */
  readonly trustsWebhookPayload: boolean

  createCharge(creds: GatewayCredentials, input: CreateChargeInput): Promise<CreateChargeResult>
  /** 501 bila tidak didukung */
  createSubscription(creds: GatewayCredentials, input: CreateSubscriptionInput): Promise<SubscriptionResult>
  cancelSubscription(creds: GatewayCredentials, providerRef: string): Promise<void>
  /** hanya pending/challenge; 409 bila sudah selesai */
  cancelCharge(creds: GatewayCredentials, orderId: string): Promise<CancelChargeResult>
  /** sumber kebenaran */
  getStatus(creds: GatewayCredentials, orderId: string): Promise<NormalizedPayment>

  verifyWebhook(creds: GatewayCredentials, payload: WebhookPayload, headers: Record<string, string | undefined>): boolean
  normalizeWebhook(payload: WebhookPayload): NormalizedPayment
  /** id gateway (berprefiks pada hub) */
  webhookOrderId(payload: WebhookPayload): string | null
  /** sidik jari stabil untuk dedupe */
  webhookDedupeSource(payload: WebhookPayload): string
  /** kata mentah penyedia, untuk log callback */
  webhookStatus(payload: WebhookPayload): string | null
  /** nomor pesanan pada redirect kembali */
  redirectOrderId(query: Record<string, unknown>): string | null
}
