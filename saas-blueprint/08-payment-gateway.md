# 08 — Payment Gateway (Nexadream Payment Hub)

> **Reference links**
> - Payment Hub host (default `baseUrl`): <https://nexadream.id>
> - Payment Hub API documentation: <https://nexadream.id/docs/payment-hub>
> - API base path used by the driver: `https://nexadream.id/api/hub/v1/transactions`
>
> Read the hub documentation before implementing — if it disagrees with §5
> below, the hub documentation wins.

> **HRIS Nexadream scope (D5, MUST).** This hub integration is used **only** for
> company (tenant) → platform **subscription** payments. **Salary, payroll,
> THR, reimbursements and any other employee/company money never go through
> the hub or any driver** — payroll is calculated and recorded
> (`draft → approved → paid_recorded`) and the bank transfer happens outside
> the platform. Nothing in `server/services/payments/` may be imported by
> payroll code. Order ids: hub prefix `HRN` (`{{ORDER_PREFIX}}`, to be
> confirmed with the hub admin) → gateway sees `HRN-<reference>`; our local
> references use `HR` (`{{LOCAL_ORDER_PREFIX}}`), e.g. `HR-20261015-00042`.
> The payer is the company owner (`owner` role); employees never pay.

Provider-agnostic **by contract**. This is a product requirement (protects
against vendor lock-in on a cost-sensitive part of the stack), not a style
preference.

```
server/services/payments/
  types.ts           driver contract — the ONLY place business code imports payment types from
  index.ts           registry, getPaymentDriver(), getActiveGateway(), getGatewayCredentials()
  nexadream-hub.ts   the live driver
  <other>.ts         scaffolded drivers that throw 501 (proves the seam is real)
shared/utils/payments.ts   PAYMENT_PROVIDERS catalog + our status vocabulary
server/utils/checkout.ts          startCheckout, cancelTenantPayment
server/utils/payment-apply.ts     normalizeCallback, applyPayment
server/utils/payment-reconcile.ts reconcilePendingPayments
server/api/webhooks/payments/[provider].post.ts   callback receiver
server/api/admin/payment-gateways/*               credentials editor
server/api/admin/webhook-events/*                 callback log + replay
```

## 1. Non-negotiables

- **Our own status vocabulary** everywhere:
  `pending | paid | failed | expired | refunded | cancelled | challenge`. The
  provider's raw word is kept in `rawStatus` for support only.
- **Amounts are integers in the smallest currency unit** (IDR: `250000`,
  never `250000.00`) across the whole payment path. Never `Float`.
- **Credentials live in a `PaymentGateway` row**, edited at
  `/admin/payment-gateways`, secrets **encrypted at rest** (AES-256-GCM,
  `enc:v1:<iv>:<tag>:<ct>`) and **never returned raw** (masked).
- **Exactly one gateway is active.** Activating one deactivates the others in
  the same transaction.
- **Webhooks have no auth middleware — the driver decides what makes a
  callback trustworthy.** Every raw callback is persisted (deduped) before it
  is applied.
- **Never fulfil from unverifiable callback content.** If the driver cannot
  verify a signature (the hub's case), re-read the status from the provider.
- **No provider vocabulary outside the provider file** (hosts, status words,
  field names, signature recipes) — except the provider catalog and the admin
  form, which are data.
- Adding a gateway = **one new driver file + one line in `DRIVERS` + one entry
  in `PAYMENT_PROVIDERS`**.

## 2. Driver contract — `types.ts`

```ts
import type { PaymentStatusValue } from '#shared/utils/payments'

export interface GatewayCredentials {
  provider: string
  serverKey: string        // decrypted at call site; hub: the platform API key
  clientKey: string
  merchantId?: string
  baseUrl?: string         // hub host
  orderPrefix?: string     // prefix the hub issued to this platform
  isSandbox: boolean
  config?: Record<string, unknown>
}

export interface ChargeCustomer { name: string, email?: string | null, phone?: string | null }

export interface CreateChargeInput {
  orderId: string          // OUR order id
  amount: number           // integer, smallest unit
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
  gatewayOrderId?: string  // what the gateway sees (hub: PREFIX-orderId) — callbacks use this
  redirectUrl: string      // hosted payment page
  token?: string
  clientKey?: string
  expiresAt?: Date
  raw?: Record<string, unknown>
}

export interface NormalizedPayment {
  orderId: string          // OUR order id
  status: PaymentStatusValue
  rawStatus: string
  amount: number
  currency: string
  paymentType?: string | null
  paidAt?: Date | null
  raw?: Record<string, unknown>
}

export interface CancelChargeResult extends NormalizedPayment { alreadyCancelled: boolean }

export interface CreateSubscriptionInput { name: string, amount: number, currency: string,
  period: 'monthly' | 'yearly', customer: ChargeCustomer, paymentToken: string,
  startAt?: Date, metadata?: Record<string, unknown> }
export interface SubscriptionResult { providerRef: string, status: string, raw?: Record<string, unknown> }

export interface PaymentDriver {
  readonly provider: string
  /** true: shared signing secret → verify then apply payload.
   *  false: unsigned nudge → read order id, then getStatus(). */
  readonly trustsWebhookPayload: boolean

  createCharge(creds, input: CreateChargeInput): Promise<CreateChargeResult>
  createSubscription(creds, input: CreateSubscriptionInput): Promise<SubscriptionResult> // 501 if unsupported
  cancelSubscription(creds, providerRef: string): Promise<void>
  cancelCharge(creds, orderId: string): Promise<CancelChargeResult>  // pending/challenge only; 409 if settled
  getStatus(creds, orderId: string): Promise<NormalizedPayment>      // authoritative

  verifyWebhook(creds, payload, headers): boolean
  normalizeWebhook(payload): NormalizedPayment
  webhookOrderId(payload): string | null        // gateway's id (prefixed on a hub)
  webhookDedupeSource(payload): string          // stable fingerprint
  webhookStatus(payload): string | null         // provider's raw word, for the callback log
  redirectOrderId(query): string | null         // order id on the return redirect
}
```

## 3. Registry — `index.ts`

```ts
const DRIVERS: Record<string, PaymentDriver> = {
  [nexadreamHubDriver.provider]: nexadreamHubDriver,
  // [otherDriver.provider]: otherDriver,
}

isSupportedProvider(provider): boolean
getPaymentDriver(provider): PaymentDriver               // 400 if unknown
listPaymentDrivers(): string[]

/** The one place a stored row becomes usable credentials. */
function toCredentials(row): GatewayCredentials {
  return { provider: row.provider, serverKey: decrypt(row.serverKey),
           clientKey: row.clientKey ? decrypt(row.clientKey) : '',
           merchantId, baseUrl, orderPrefix, isSandbox, config }
}

getActiveGateway(): { driver, creds } | null   // isActive row with a serverKey and a known driver
getGatewayCredentials(provider): creds | null  // for the webhook of a named provider
requireActiveGateway(g)                        // 503 "payments unavailable, contact support"
```

## 4. Provider catalog — `shared/utils/payments.ts`

Drives the admin form and the "may this gateway go live" check — a new
provider needs no new UI.

```ts
export interface PaymentCredentialFieldMeta {
  key: 'serverKey' | 'clientKey' | 'merchantId' | 'baseUrl' | 'orderPrefix'
  label: string; hint?: string; placeholder?: string
  secret: boolean        // stored encrypted, password input, never shown again
}

export interface PaymentProviderMeta {
  value: string; label: string; description: string; icon: string; docsUrl: string
  isImplemented: boolean      // false = scaffold that throws
  supportsRecurring: boolean
  supportsSandbox: boolean    // false hides the sandbox toggle
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
      { key: 'serverKey', label: 'Kunci API', secret: true, placeholder: 'phk_live_…',
        hint: 'Kunci platform dari Payment Hub, diawali phk_live_ (ini kunci milik Payment Hub, bukan kunci API HRIS Nexadream yang berawalan hn_live_). Disimpan terenkripsi dan tidak pernah ditampilkan lagi.' },
      { key: 'baseUrl', label: 'Alamat Payment Hub', secret: false, placeholder: 'https://nexadream.id',
        hint: 'Tanpa garis miring di akhir.' },
      { key: 'orderPrefix', label: 'Prefiks nomor pesanan', secret: false, placeholder: 'HRN',
        hint: 'Prefiks yang diberikan Payment Hub untuk platform ini. Dipakai untuk mencocokkan callback dengan pembayaran.' }
    ]
  }
]

export const PAYMENT_STATUSES = ['pending','paid','failed','expired','refunded','cancelled','challenge'] as const
export const BILLING_PERIODS = ['monthly', 'yearly'] as const
```

## 5. The Nexadream Payment Hub driver

### 5.1 What the hub is

The hub fronts **one upstream merchant account** and lends it to several
platforms. The platform holds a **platform API key** (`phk_live_…`); the
gateway's signing secret never leaves the hub. Routing is by an **order-id
prefix** the hub issues to each platform: our `reference` goes upstream as
`{{ORDER_PREFIX}}-<reference>` (i.e. `HRN-HR-20261015-00042`), and the hub hands our own reference back on
every read.

Two consequences:

1. **Callbacks cannot be verified** — they arrive as the gateway's raw payload,
   signed with a secret we don't have. So `trustsWebhookPayload = false`, and
   the receiver confirms with `getStatus` before applying anything.
2. **No recurring API, no sandbox.** A renewal is a fresh checkout.

Because other platforms share the merchant account, **callbacks for orders we
never created will arrive**. That is normal: store, answer 200, apply nothing.

### 5.2 HTTP calls

All requests: `Authorization: Bearer <serverKey>`, JSON in/out, base =
`creds.baseUrl` (trimmed, no trailing slash; missing → 503 "hub address not
set").

| Purpose | Request | Notes |
|---|---|---|
| Create charge | `POST {base}/api/hub/v1/transactions` | body below |
| Get status | `GET {base}/api/hub/v1/transactions/{ourReference}` | never the prefixed id |
| Cancel charge | `POST {base}/api/hub/v1/transactions/{ourReference}/cancel` | 200 + `alreadyCancelled:true` if already cancelled; 409 if settled |

Create-charge body:

```json
{
  "reference": "HR-20261015-00042",
  "amount": 199000,
  "currency": "IDR",
  "customer": { "firstName": "<owner name, max 50>", "email": "…", "phone": "…" },
  "items": [{ "id": "subscription", "name": "Langganan Growth (bulanan)", "price": 199000, "quantity": 1 }],
  "finishUrl": "<successUrl>",
  "metadata": { "tenantId": "…", "planSlug": "growth", "period": "monthly" },
  "expiryMinutes": 60
}
```

- The hub validates that items sum exactly to `amount` → send **one line** at
  the full amount.
- `metadata` carries **only** ids/slugs (`tenantId`, `planSlug`, `period`) —
  never employee names, NIK, salary or any other personal data (D7); the hub
  and upstream gateway are third parties. `customer` is the paying owner.
- Per-employee pricing (D4 open question) would still be **one line at the
  computed total**; the breakdown stays in our own invoice record.
- `expiryMinutes` = clamp(round((expiresAt − now)/60000), 1, 43200).
- Error and pending redirects are configured per platform at the hub; only the
  finish URL is per payment.

Hub transaction response fields used: `orderId` (prefixed, = our
`gatewayOrderId`), `reference` (ours), `redirectUrl`, `token`, `clientKey`,
`status` (already in our 7-word vocabulary), `gatewayStatus` (raw), `amount`,
`currency`, `paymentType`, `settlementTime`, `alreadyCancelled`.

Error mapping (the hub's own message goes to the **log**, never to the user):

| Hub HTTP | We throw | Message (user-facing) |
|---|---|---|
| 404 | 404 `NOT_FOUND` | payment not found at the hub |
| 409 | 409 `CONFLICT` | already processed by the gateway, cannot cancel |
| 501 | 501 | gateway does not support cancellation |
| 401 / 403 | **503** `SERVER_ERROR` | payments unavailable, contact support (misconfigured key) |
| other | 502 `SERVER_ERROR` | gateway refused, try again shortly |
| 2xx without `redirectUrl` on create | 502 | gateway returned no payment page |

### 5.3 Normalization

```ts
function toStatus(v?: string): PaymentStatusValue {
  const s = String(v ?? '').toLowerCase()
  return PAYMENT_STATUSES.includes(s) ? s : 'pending'   // unknown = "not money yet"
}

function toReference(p, creds): string {
  if (p.reference) return p.reference
  const prefix = (creds.orderPrefix ?? '').trim()
  const id = p.orderId ?? ''
  return prefix && id.startsWith(`${prefix}-`) ? id.slice(prefix.length + 1) : id
}

function normalize(p, creds): NormalizedPayment {
  const status = toStatus(p.status)
  return {
    orderId: toReference(p, creds),
    status,
    rawStatus: p.gatewayStatus || p.status || 'unknown',
    amount: Math.round(Number(p.amount ?? 0)),
    currency: String(p.currency ?? 'IDR'),
    paymentType: p.paymentType ?? null,
    paidAt: status === 'paid' && p.settlementTime ? new Date(p.settlementTime) : null,
    raw: p
  }
}
```

### 5.4 Driver methods

```ts
export const nexadreamHubDriver: PaymentDriver = {
  provider: 'nexadream_hub',
  trustsWebhookPayload: false,

  createCharge: /* POST transactions → { orderId: res.reference ?? input.orderId,
                   gatewayOrderId: res.orderId, redirectUrl, token, clientKey, expiresAt, raw } */,
  createSubscription: () => { throw 501 },          // no recurring API
  cancelSubscription: async () => {},               // nothing upstream to cancel
  cancelCharge: /* POST …/cancel → { ...normalize(res), alreadyCancelled: !!res.alreadyCancelled } */,
  getStatus: /* GET …/{reference} → normalize(res) */,

  verifyWebhook: () => false,                       // never called (trustsWebhookPayload=false)
  normalizeWebhook: () => { throw 500 },            // never called

  // The raw upstream gateway payload reaches us untouched → its field names:
  webhookOrderId: p => str(p.order_id ?? p.external_id ?? p.id),
  webhookDedupeSource: p => [p.order_id ?? p.external_id ?? p.id,
                             p.transaction_status ?? p.status,
                             p.transaction_id ?? p.status_code ?? ''].join(':'),
  webhookStatus: p => str(p.transaction_status ?? p.status),
  redirectOrderId: q => str(q.reference ?? q.order_id)   // hub appends OUR reference
}
```

### 5.5 Matching callbacks to payments

- Checkout stores the hub's prefixed id in `Payment.gatewayOrderId` (unique).
- A callback carries the **prefixed** id → match on `gatewayOrderId` **exactly**.
  Never reconstruct by stripping the prefix (it would break silently if the hub
  reassigns a prefix).
- All reads back to the hub use **our** `orderId` (the reference).

### 5.6 Registration with the hub administrator

Provisioning or moving an environment, give the hub admin these values (the
hub holds them, the platform does not):

| What | Value |
|---|---|
| Webhook | `{{SITE_URL}}/api/webhooks/payments/nexadream_hub` |
| Finish redirect | `{{SITE_URL}}/app/billing?status=success` |
| Error redirect | `{{SITE_URL}}/app/billing?status=failed` |
| Pending redirect | `{{SITE_URL}}/app/billing?status=pending` |

With D1: `{{SITE_URL}}` = `https://hris.nexadream.id`, so the webhook is
`https://hris.nexadream.id/api/webhooks/payments/nexadream_hub`. The prefix
`HRN` is **proposed** — the hub admin must confirm it is free and issue it.

And receive from them: the **platform API key** and the **order prefix**.
Enter both (plus base URL) at `/admin/payment-gateways`, then activate.

## 6. Webhook receiver — `POST /api/webhooks/payments/[provider]`

```ts
export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')!
  if (!isSupportedProvider(provider)) throw 404
  const payload = await readBody(event).catch(() => null)
  if (!payload || typeof payload !== 'object') throw 400

  const creds = await getGatewayCredentials(provider)
  if (!creds) throw 503                                   // not configured

  const driver = getPaymentDriver(provider)
  const headers = getRequestHeaders(event)
  if (driver.trustsWebhookPayload && !driver.verifyWebhook(creds, payload, headers)) {
    throw 401                                             // reveal nothing about why
  }

  const gatewayOrderId = driver.webhookOrderId(payload)
  const dedupeKey = `${provider}:${sha256(driver.webhookDedupeSource(payload))}`

  const existing = await prisma.paymentWebhookEvent.findUnique({ where: { dedupeKey } })
  if (existing?.processedAt) return { received: true, duplicate: true }

  const record = existing ?? await prisma.paymentWebhookEvent.create({
    data: { provider, dedupeKey, orderId: gatewayOrderId, payload, headers }
  })

  try {
    const normalized = await normalizeCallback(driver, creds, payload)
    if (!normalized) {                                    // not our order (shared merchant)
      await markProcessed(record, { error: 'unknown order' })
      return { received: true, applied: false }           // 200 — retrying changes nothing
    }
    const result = await applyPayment(normalized)
    await markProcessed(record, {
      orderId: gatewayOrderId ?? normalized.orderId,
      error: result.applied || result.noop ? null : result.reason ?? null   // no-op is healthy
    })
    return { received: true, applied: result.applied }
  } catch (e) {
    await prisma.paymentWebhookEvent.update({ where: { id: record.id }, data: { error: e.message } })
    throw 500                                             // provider retries; row kept for replay
  }
})
```

`normalizeCallback(driver, creds, payload)`:

```ts
if (driver.trustsWebhookPayload) return driver.normalizeWebhook(payload)
const gatewayOrderId = driver.webhookOrderId(payload)
if (!gatewayOrderId) throw new Error('callback carried no order id')
const payment = await prisma.payment.findUnique({ where: { gatewayOrderId }, select: { orderId: true } })
if (!payment) return null                      // another platform's order
return driver.getStatus(creds, payment.orderId) // the truth, from the hub
```

`applyPayment` is described in `07-subscription-lifecycle.md` §4.

## 7. Admin replay — `POST /api/admin/webhook-events/:id/replay`

`payments.write`. Loads the stored event, refuses if the provider is no longer
supported or has no credentials (409), runs the **same** `normalizeCallback`
(for the hub this re-reads live status — safer than re-applying a stale
payload), `applyPayment`, then sets `processedAt`, increments `replayCount`,
clears `error` on applied/no-op, and audits `payment.webhook_replay`. Safe to
press twice.

`GET /api/admin/webhook-events` lists events with filters (provider,
processed/error, search by order id) and shows **what the gateway said**
(`driver.webhookStatus(payload)`) next to **what we did** (processed / error).

## 8. Reconciliation (safety net)

Unverifiable callbacks can also be missed. The daily cron re-reads every
payment still `pending` created in the last **48 hours** (max 200, oldest
first) from the **active** gateway and pushes each through `applyPayment`.
Errors on one order are logged and skipped. Idempotent.

```ts
export async function reconcilePendingPayments(): Promise<{ checked: number, updated: number }>
```

## 9. Admin gateway configuration — `/admin/payment-gateways`

- `GET /api/admin/payment-gateways` (`payments.read`) →
  `{ providers: PAYMENT_PROVIDERS, items: [{ id, provider, label, isActive,
  isSandbox, merchantId, baseUrl, orderPrefix, serverKeyMasked,
  clientKeyMasked, hasServerKey, hasClientKey, updatedAt }] }`.
  `maskSecret(v)` → `abcd••••wxyz` (or `••••••••` when ≤ 8 chars).
- `PATCH /api/admin/payment-gateways/:id` (`payments.write`):

  ```ts
  z.object({
    label: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
    isSandbox: z.boolean().optional(),
    merchantId: z.string().nullable().optional(),
    baseUrl: z.string().url().nullable().optional().or(z.literal('')),
    orderPrefix: z.string().regex(/^[A-Za-z0-9_-]+$/).nullable().optional().or(z.literal('')),
    serverKey: z.string().optional(),   // '' = keep stored value
    clientKey: z.string().optional()
  })
  ```

  - Empty string from a cleared field → `null`; `baseUrl` trailing slashes
    stripped.
  - Activating an unimplemented provider → 409.
  - Activating requires **every field the catalog lists** to be present (new
    value or already stored) → else 409 "Lengkapi <fields> …".
  - Transaction: if activating, deactivate every other gateway; update this
    one; secrets written as `encrypt(value)` only when a new value is sent.
- Rows are seeded inactive, without credentials (`gateway-nexadream-hub`
  with `baseUrl: 'https://nexadream.id'`, `isSandbox: false`).

## 10. Adding another gateway later

1. `server/services/payments/<name>.ts` implementing `PaymentDriver` (start by
   throwing 501 everywhere — a scaffold proves the seam).
2. One line in `DRIVERS`.
3. One entry in `PAYMENT_PROVIDERS` with its `fields`.
4. Seed (and migrate) an inactive `PaymentGateway` row.
5. If it signs webhooks with a shared secret: `trustsWebhookPayload = true`,
   implement `verifyWebhook` + `normalizeWebhook`. If it supports mandates:
   implement `createSubscription` / `cancelSubscription` and store
   `Subscription.providerRef`.

Nothing else in the codebase should change.
