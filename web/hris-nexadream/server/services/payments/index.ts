import type { PaymentGateway } from '~~/generated/prisma/client'
import { nexadreamHubDriver } from './nexadream-hub'
import type { GatewayCredentials, PaymentDriver } from './types'

// Registri driver pembayaran. Menambah gateway = satu file driver + satu baris di sini
// + satu entri di PAYMENT_PROVIDERS. Kode payroll TIDAK BOLEH mengimpor modul ini (D5).

export type { CreateChargeInput, GatewayCredentials, NormalizedPayment, PaymentDriver, WebhookPayload } from './types'

const DRIVERS: Record<string, PaymentDriver> = {
  [nexadreamHubDriver.provider]: nexadreamHubDriver
}

export function isSupportedProvider(provider: string): boolean {
  return provider in DRIVERS
}

export function getPaymentDriver(provider: string): PaymentDriver {
  const driver = DRIVERS[provider]
  if (!driver) throw httpError(400, 'VALIDATION_FAILED', 'Penyedia pembayaran tidak dikenal.')
  return driver
}

export function listPaymentDrivers(): string[] {
  return Object.keys(DRIVERS)
}

/** Satu-satunya tempat baris tersimpan menjadi kredensial yang bisa dipakai. */
function toCredentials(row: PaymentGateway): GatewayCredentials {
  return {
    provider: row.provider,
    serverKey: decrypt(row.serverKey),
    clientKey: row.clientKey ? decrypt(row.clientKey) : '',
    merchantId: row.merchantId,
    baseUrl: row.baseUrl,
    orderPrefix: row.orderPrefix,
    isSandbox: row.isSandbox,
    config: (row.config as Record<string, unknown> | null) ?? null
  }
}

export async function getActiveGateway(): Promise<{ driver: PaymentDriver, creds: GatewayCredentials } | null> {
  const row = await prisma.paymentGateway.findFirst({ where: { isActive: true } })
  if (!row?.serverKey || !isSupportedProvider(row.provider)) return null
  const creds = toCredentials(row)
  if (!creds.serverKey) return null // kunci tidak bisa didekripsi (rahasia dirotasi)
  return { driver: DRIVERS[row.provider]!, creds }
}

/** Untuk webhook penyedia tertentu (aktif atau tidak — callback lama tetap boleh diproses). */
export async function getGatewayCredentials(provider: string): Promise<GatewayCredentials | null> {
  const row = await prisma.paymentGateway.findUnique({ where: { provider } })
  if (!row?.serverKey) return null
  const creds = toCredentials(row)
  return creds.serverKey ? creds : null
}

export function requireActiveGateway<T>(gateway: T | null): T {
  if (!gateway) throw httpError(503, 'INTERNAL', 'Pembayaran sedang tidak tersedia. Hubungi tim dukungan.')
  return gateway
}
