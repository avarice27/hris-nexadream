import type { PlanFeatures, PlanLimits } from '#shared/utils/plans'

export interface BillingPlan {
  id: string
  slug: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  trialDays: number
  limits: PlanLimits
  features: PlanFeatures
}

export interface BillingPayment {
  id: string
  orderId: string
  status: string
  amount: number
  currency: string
  period: 'monthly' | 'yearly'
  planSlug: string | null
  paymentType: string | null
  redirectUrl: string | null
  paidAt: string | null
  hasInvoice?: boolean
  expiresAt: string | null
  createdAt: string
}

export interface BillingOverview {
  subscription: {
    status: string
    period: 'monthly' | 'yearly'
    planSlug: string
    planName: string
    trialEndsAt: string | null
    currentPeriodEnd: string | null
    graceEndsAt: string | null
    cancelledAt: string | null
  } | null
  plans: BillingPlan[]
  pendingPayments: BillingPayment[]
  needsBranchSelection: boolean
  checkoutAvailable: boolean
  impersonating: boolean
}

export function useBilling() {
  const overview = useState<BillingOverview | null>('billing:overview', () => null)
  const status = useState<'idle' | 'loading' | 'error' | 'success'>('billing:status', () => 'idle')
  const errorMessage = useState<string>('billing:error', () => '')

  async function load() {
    status.value = overview.value ? 'success' : 'loading'
    try {
      overview.value = await apiFetch<BillingOverview>('/api/app/subscription')
      status.value = 'success'
    } catch (error) {
      errorMessage.value = extractErrorMessage(error)
      status.value = 'error'
    }
  }

  return { overview, status, errorMessage, load }
}
