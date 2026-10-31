import type { H3Event } from 'h3'
import { z } from 'zod'
import { invoiceTaxBreakdown, STAMP_DUTY_AMOUNT } from '#shared/utils/invoice-tax'
import { BILLING_PERIOD_LABELS, type BillingPeriodValue } from '#shared/utils/payments'
import { zonedDateKey } from '#shared/utils/timezone'
import type { SubscriptionInvoice } from '~~/generated/prisma/client'

// Invoice & bukti pembayaran langganan (D24). Diterbitkan sekali per pembayaran berhasil —
// setelah applyPayment() (best-effort) atau saat pertama kali dibuka. Snapshot tidak pernah diubah;
// hanya nomor Faktur Pajak (dari Coretax DJP) yang diisi staf belakangan.

type InvoiceRow = SubscriptionInvoice

/** Terbitkan invoice untuk pembayaran 'paid' (idempoten). null bila pembayaran belum berhasil. */
export async function ensureInvoiceForPayment(paymentId: string): Promise<InvoiceRow | null> {
  const existing = await prisma.subscriptionInvoice.findUnique({ where: { paymentId } })
  if (existing) return existing
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { tenant: { select: { name: true, legalName: true, npwp: true } } }
  })
  if (!payment || payment.status !== 'paid') return null

  const [pkp, vatRatePercent, sellerNpwp, sellerAddress, legalName, appName] = [
    await getBooleanSetting('billing.pkpRegistered'),
    await getNumberSetting('billing.vatRatePercent'),
    (await getSetting('billing.sellerNpwp')).trim(),
    (await getSetting('company.address')).trim(),
    (await getSetting('company.legalName')).trim(),
    await getSetting('company.name')
  ]
  const plan = payment.planSlug ? await prisma.plan.findUnique({ where: { slug: payment.planSlug }, select: { name: true } }) : null
  const branch = await prisma.branch.findFirst({ where: { tenantId: payment.tenantId, isPrimary: true }, select: { address: true } })
  const tax = invoiceTaxBreakdown(payment.amount, { pkp, vatRatePercent })
  const issuedAt = payment.paidAt ?? new Date()
  const [row] = await prisma.$queryRaw<Array<{ seq: bigint }>>`SELECT nextval('subscription_invoice_seq') AS seq`
  const number = `INV/${zonedDateKey(issuedAt, 'Asia/Jakarta').slice(0, 4)}/${String(row?.seq ?? Date.now()).padStart(6, '0')}`

  try {
    return await prisma.subscriptionInvoice.create({
      data: {
        tenantId: payment.tenantId,
        paymentId: payment.id,
        number,
        issuedAt,
        description: `Langganan ${appName} paket ${plan?.name ?? payment.planSlug ?? '-'} — ${BILLING_PERIOD_LABELS[payment.period as BillingPeriodValue] ?? payment.period}`,
        sellerName: legalName || 'Nexadream',
        sellerNpwp: sellerNpwp || null,
        sellerAddress: sellerAddress || null,
        sellerIsPkp: pkp,
        buyerName: payment.tenant.legalName || payment.tenant.name,
        buyerAddress: branch?.address ?? null,
        buyerNpwpEncrypted: payment.tenant.npwp, // sudah terenkripsi (kunci HR)
        currency: payment.currency,
        total: tax.total,
        taxBase: tax.taxBase,
        otherTaxBase: tax.otherTaxBase,
        vatRatePercent: tax.vatRatePercent,
        vat: tax.vat,
        stampDutyApplies: tax.stampDutyApplies
      }
    })
  } catch (error) {
    // Balapan dua permintaan: baris pemenang dipakai (nomor urut yang terbuang tidak masalah).
    const winner = await prisma.subscriptionInvoice.findUnique({ where: { paymentId } })
    if (winner) return winner
    throw error
  }
}

/** Dipanggil setelah pembayaran diterapkan; tidak pernah menggagalkan alur pembayaran. */
export async function issueInvoiceSafely(paymentId: string) {
  try {
    await ensureInvoiceForPayment(paymentId)
  } catch (error) {
    console.error('[invoices] issue failed', paymentId, error)
  }
}

function toInvoiceView(row: InvoiceRow, payment: { orderId: string, paymentType: string | null, provider: string }) {
  const buyerNpwp = row.buyerNpwpEncrypted ? decrypt(row.buyerNpwpEncrypted, 'hr') : null
  return {
    id: row.id,
    number: row.number,
    issuedAt: row.issuedAt.toISOString(),
    description: row.description,
    seller: { name: row.sellerName, npwp: row.sellerNpwp, address: row.sellerAddress, isPkp: row.sellerIsPkp },
    buyer: { name: row.buyerName, address: row.buyerAddress, npwp: buyerNpwp },
    currency: row.currency,
    total: row.total,
    taxBase: row.taxBase,
    otherTaxBase: row.otherTaxBase,
    vatRatePercent: Number(row.vatRatePercent),
    vat: row.vat,
    stampDutyApplies: row.stampDutyApplies,
    stampDutyAmount: STAMP_DUTY_AMOUNT,
    taxInvoiceNumber: row.taxInvoiceNumber,
    payment: { orderId: payment.orderId, paymentType: payment.paymentType, provider: payment.provider }
  }
}

export type InvoiceView = ReturnType<typeof toInvoiceView>

/** Konsol perusahaan: invoice untuk pembayaran milik tenant ini (diterbitkan bila belum ada). */
export async function tenantPaymentInvoice(event: H3Event, paymentId: string): Promise<InvoiceView> {
  const ctx = await requireTenantAbility(event, 'billing.manage')
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, tenantId: ctx.tenantId }, select: { id: true, orderId: true, paymentType: true, provider: true } })
  if (!payment) throw notFound('Pembayaran tidak ditemukan.')
  const invoice = await ensureInvoiceForPayment(payment.id)
  if (!invoice) throw httpError(409, 'CONFLICT', 'Invoice hanya tersedia untuk pembayaran yang berhasil.')
  return toInvoiceView(invoice, payment)
}

/** Back-office: invoice untuk pembayaran mana pun. */
export async function adminPaymentInvoice(event: H3Event, paymentId: string): Promise<InvoiceView> {
  await requirePermission(event, 'payments.read')
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true, orderId: true, paymentType: true, provider: true } })
  if (!payment) throw notFound('Pembayaran tidak ditemukan.')
  const invoice = await ensureInvoiceForPayment(payment.id)
  if (!invoice) throw httpError(409, 'CONFLICT', 'Invoice hanya tersedia untuk pembayaran yang berhasil.')
  return toInvoiceView(invoice, payment)
}

export const taxInvoiceNumberSchema = z.object({
  taxInvoiceNumber: z.string().trim().max(40, 'Nomor Faktur Pajak terlalu panjang.').nullable()
})

/** Back-office: catat nomor Faktur Pajak yang diterbitkan di Coretax. */
export async function adminSetTaxInvoiceNumber(event: H3Event, paymentId: string, input: z.infer<typeof taxInvoiceNumberSchema>) {
  const actor = await requirePermission(event, 'payments.write')
  const invoice = await prisma.subscriptionInvoice.findUnique({ where: { paymentId } })
  if (!invoice) throw notFound('Invoice belum diterbitkan.')
  const updated = await prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { taxInvoiceNumber: input.taxInvoiceNumber || null } })
  await recordAudit(event, {
    audience: 'platform', action: 'invoice.tax_invoice_number', actorId: actor.user.id, actorName: actor.user.name,
    tenantId: invoice.tenantId, targetType: 'subscription_invoice', targetId: invoice.id, metadata: { number: invoice.number }
  })
  return { taxInvoiceNumber: updated.taxInvoiceNumber }
}
