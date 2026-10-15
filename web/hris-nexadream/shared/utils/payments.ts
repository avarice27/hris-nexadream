// Katalog penyedia pembayaran + kosakata status kita sendiri. HANYA untuk langganan
// perusahaan → platform (D5). Gaji karyawan tidak pernah melewati jalur ini.

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'expired', 'refunded', 'cancelled', 'challenge'] as const
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number]

export const BILLING_PERIODS = ['monthly', 'yearly'] as const
export type BillingPeriodValue = (typeof BILLING_PERIODS)[number]

export const BILLING_PERIOD_LABELS: Record<BillingPeriodValue, string> = {
  monthly: 'Bulanan',
  yearly: 'Tahunan'
}

export interface PaymentCredentialFieldMeta {
  key: 'serverKey' | 'clientKey' | 'merchantId' | 'baseUrl' | 'orderPrefix'
  label: string
  hint?: string
  placeholder?: string
  /** disimpan terenkripsi, input kata sandi, tidak pernah ditampilkan lagi */
  secret: boolean
}

export interface PaymentProviderMeta {
  value: string
  label: string
  description: string
  icon: string
  docsUrl: string
  /** false = kerangka yang melempar 501 */
  isImplemented: boolean
  supportsRecurring: boolean
  supportsSandbox: boolean
  fields: PaymentCredentialFieldMeta[]
}

export const PAYMENT_PROVIDERS: PaymentProviderMeta[] = [
  {
    value: 'nexadream_hub',
    label: 'Nexadream Payment Hub',
    description: 'Satu akun merchant Nexadream dipakai bersama. Mendukung kartu, VA bank, e-wallet dan QRIS, tanpa menyimpan kunci rahasia gateway di platform.',
    icon: 'i-lucide-credit-card',
    docsUrl: 'https://nexadream.id/docs/payment-hub',
    isImplemented: true,
    supportsRecurring: false,
    supportsSandbox: false,
    fields: [
      {
        key: 'serverKey',
        label: 'Kunci API',
        secret: true,
        placeholder: 'phk_live_…',
        hint: 'Kunci platform dari Payment Hub, diawali phk_live_ (bukan kunci API HRIS Nexadream yang berawalan hn_live_). Disimpan terenkripsi dan tidak pernah ditampilkan lagi.'
      },
      { key: 'baseUrl', label: 'Alamat Payment Hub', secret: false, placeholder: 'https://nexadream.id', hint: 'Tanpa garis miring di akhir.' },
      {
        key: 'orderPrefix',
        label: 'Prefiks nomor pesanan',
        secret: false,
        placeholder: 'HRN',
        hint: 'Prefiks yang diberikan Payment Hub untuk platform ini. Dipakai untuk mencocokkan callback dengan pembayaran.'
      }
    ]
  }
]

export function providerMeta(provider: string): PaymentProviderMeta | undefined {
  return PAYMENT_PROVIDERS.find(p => p.value === provider)
}

export function providerLabel(provider: string): string {
  return providerMeta(provider)?.label ?? provider
}

/** Prefiks nomor pesanan kita (bukan prefiks hub). */
export const LOCAL_ORDER_PREFIX = 'HR'
/** Prefiks yang DIUSULKAN untuk diterbitkan hub (konfirmasi dengan admin hub). */
export const HUB_ORDER_PREFIX = 'HRN'

/** "Menunggu pembayaran" = pending/challenge DAN belum lewat expiresAt. */
export function isAwaitingPayment(payment: { status: string, expiresAt: string | Date | null }, now = new Date()): boolean {
  if (payment.status !== 'pending' && payment.status !== 'challenge') return false
  return !payment.expiresAt || new Date(payment.expiresAt) > now
}
