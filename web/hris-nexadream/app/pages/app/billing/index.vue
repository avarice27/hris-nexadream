<script setup lang="ts">
import { FEATURE_KEYS, FEATURE_META, LIMIT_KEYS, LIMIT_META, formatLimit } from '#shared/utils/plans'
import { formatDateId, formatIDR } from '#shared/utils/format'
import { BILLING_PERIOD_LABELS } from '#shared/utils/payments'
import { SUBSCRIPTION_STATUS_META, statusMeta } from '#shared/utils/status'
import type { BillingPayment, BillingPlan } from '~/composables/useBilling'

definePageMeta({ layout: 'tenant' })
useHead({ title: 'Langganan' })

const auth = useTenantAuth()
const toast = useApiToast()
const entitlements = useEntitlements()
const { confirm } = useConfirmDialog()
const { overview, status, errorMessage, load } = useBilling()

const period = ref<'monthly' | 'yearly'>('monthly')
const busyPlan = ref<string | null>(null)
const tz = computed(() => auth.displayTimezone.value)

onMounted(async () => {
  await load()
  if (overview.value?.subscription?.period) period.value = overview.value.subscription.period
})

const sub = computed(() => overview.value?.subscription ?? null)
const subMeta = computed(() => statusMeta(SUBSCRIPTION_STATUS_META, sub.value?.status))
const isPaidActive = computed(() => sub.value?.status === 'active' || sub.value?.status === 'cancelled')
const canCheckout = computed(() => !!overview.value?.checkoutAvailable)

function price(plan: BillingPlan) {
  return period.value === 'yearly' ? plan.priceYearly : plan.priceMonthly
}

function isCurrent(plan: BillingPlan) {
  return isPaidActive.value && sub.value?.planSlug === plan.slug && sub.value?.period === period.value
}

const yearlySaving = computed(() => {
  const paid = overview.value?.plans.find(p => p.priceMonthly > 0 && p.priceYearly > 0)
  if (!paid) return null
  return Math.round((1 - paid.priceYearly / (paid.priceMonthly * 12)) * 100)
})

/** Kartu fitur ringkas: batas + fitur yang aktif. */
function highlights(plan: BillingPlan) {
  return [
    ...LIMIT_KEYS.filter(k => k !== 'reportRetentionDays').map(k => `${formatLimit(k, plan.limits[k])} ${LIMIT_META[k].label.toLowerCase()}`),
    ...FEATURE_KEYS.filter(k => plan.features[k]).slice(0, 6).map(k => FEATURE_META[k].label)
  ]
}

async function choose(plan: BillingPlan) {
  if (!overview.value) return
  // Tagihan belum selesai selain yang persis sama → tanyakan sebelum menggantinya.
  const others = overview.value.pendingPayments.filter(p => !(p.planSlug === plan.slug && p.period === period.value))
  if (others.length) {
    const ok = await confirm({
      title: 'Ganti pembayaran yang belum selesai?',
      description: 'Ada pembayaran lain yang masih menunggu. Kami akan membatalkannya agar Anda tidak membayar dua kali.',
      confirmLabel: 'Ganti dan lanjutkan'
    })
    if (!ok) return
  }
  busyPlan.value = plan.slug
  try {
    for (const payment of others) {
      await apiFetch(`/api/app/subscription/payments/${payment.id}/cancel`, { method: 'POST' })
    }
    const result = await apiFetch<{ redirectUrl: string, reused: boolean }>('/api/app/subscription/checkout', {
      method: 'POST',
      body: { planSlug: plan.slug, period: period.value }
    })
    if (result.reused) toast.success('Melanjutkan pembayaran sebelumnya')
    window.location.href = result.redirectUrl
  } catch (error) {
    toast.error(error)
    await load()
    busyPlan.value = null
  }
}

function resumePayment(payment: BillingPayment) {
  if (payment.redirectUrl) window.location.href = payment.redirectUrl
}

async function cancelPending(payment: BillingPayment) {
  try {
    await apiFetch(`/api/app/subscription/payments/${payment.id}/cancel`, { method: 'POST' })
    toast.success('Pembayaran dibatalkan')
  } catch (error) {
    toast.error(error)
  }
  await load()
}

async function cancelSubscription() {
  const end = formatDateId(sub.value?.currentPeriodEnd, tz.value)
  const ok = await confirm({
    title: 'Hentikan langganan?',
    description: `Langganan tetap aktif sampai ${end}, lalu turun ke paket Free (maks. 10 karyawan aktif dan 1 kantor). Data karyawan, absensi, dan slip gaji tetap tersimpan.`,
    confirmLabel: 'Hentikan langganan',
    color: 'error'
  })
  if (!ok) return
  try {
    await apiFetch('/api/app/subscription/cancel', { method: 'POST' })
    toast.success('Langganan dihentikan', `Tetap aktif sampai ${end}.`)
    await Promise.all([load(), entitlements.refresh()])
  } catch (error) {
    toast.error(error)
  }
}

async function resumeSubscription() {
  try {
    await apiFetch('/api/app/subscription/resume', { method: 'POST' })
    toast.success('Langganan dilanjutkan')
    await Promise.all([load(), entitlements.refresh()])
  } catch (error) {
    toast.error(error)
  }
}
</script>

<template>
  <PagePanel title="Langganan">
    <template #actions>
      <UButton
        to="/app/billing/history"
        label="Riwayat pembayaran"
        icon="i-lucide-receipt"
        variant="ghost"
        color="neutral"
      />
    </template>

    <div
      v-if="status === 'loading'"
      class="space-y-4"
    >
      <USkeleton class="h-28 w-full" />
      <div class="grid gap-4 md:grid-cols-3">
        <USkeleton
          v-for="i in 3"
          :key="i"
          class="h-80 w-full"
        />
      </div>
    </div>
    <UAlert
      v-else-if="status === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />

    <div
      v-else-if="overview"
      class="space-y-8"
    >
      <!-- Status saat ini -->
      <UCard>
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="space-y-1">
            <p class="text-sm text-muted">
              Paket saat ini
            </p>
            <p class="flex items-center gap-2 text-xl font-semibold">
              {{ sub?.planName }}
              <UBadge
                :label="subMeta.label"
                :color="subMeta.color"
                variant="subtle"
              />
            </p>
            <p
              v-if="sub?.status === 'trialing' && sub.trialEndsAt"
              class="text-sm text-muted"
            >
              Uji coba berakhir {{ formatDateId(sub.trialEndsAt, tz) }}. Setelah itu turun ke paket Free bila belum memilih paket.
            </p>
            <p
              v-else-if="sub?.status === 'active' && sub.currentPeriodEnd"
              class="text-sm text-muted"
            >
              {{ BILLING_PERIOD_LABELS[sub.period] }} · aktif sampai {{ formatDateId(sub.currentPeriodEnd, tz) }}. Perpanjang kapan saja — sisa hari tidak hilang.
            </p>
            <p
              v-else-if="sub?.status === 'cancelled' && sub.currentPeriodEnd"
              class="text-sm text-muted"
            >
              Dihentikan. Tetap aktif sampai {{ formatDateId(sub.currentPeriodEnd, tz) }}, lalu turun ke paket Free.
            </p>
            <p
              v-else-if="sub?.status === 'downgraded'"
              class="text-sm text-muted"
            >
              Anda memakai paket Free. Data Anda tetap aman — pilih paket untuk membuka kembali semua fitur.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="sub?.status === 'active'"
              label="Hentikan langganan"
              variant="ghost"
              color="error"
              :disabled="overview.impersonating"
              @click="cancelSubscription"
            />
            <UButton
              v-if="sub?.status === 'cancelled'"
              label="Lanjutkan langganan"
              :disabled="overview.impersonating"
              @click="resumeSubscription"
            />
          </div>
        </div>
        <UAlert
          v-if="sub?.status === 'past_due' && sub.graceEndsAt"
          class="mt-4"
          color="error"
          variant="subtle"
          icon="i-lucide-credit-card"
          title="Pembayaran belum diterima"
          :description="`Bila pembayaran belum masuk sampai ${formatDateId(sub.graceEndsAt, tz)}, paket turun ke Free. Data Anda tidak dihapus.`"
        />
        <UAlert
          v-if="overview.needsBranchSelection"
          class="mt-4"
          color="warning"
          variant="subtle"
          icon="i-lucide-building"
          title="Pilih kantor yang tetap aktif"
          description="Jumlah kantor melebihi batas paket Anda."
        >
          <template #actions>
            <UButton
              to="/app/branches"
              label="Pilih kantor"
              size="xs"
            />
          </template>
        </UAlert>
      </UCard>

      <!-- Pembayaran menunggu -->
      <section
        v-if="overview.pendingPayments.length"
        class="space-y-2"
      >
        <h2 class="text-sm font-semibold">
          Menunggu pembayaran
        </h2>
        <UCard
          v-for="payment in overview.pendingPayments"
          :key="payment.id"
          :ui="{ body: 'p-4 sm:p-4' }"
        >
          <div class="flex flex-wrap items-center gap-3">
            <UIcon
              name="i-lucide-hourglass"
              class="size-5 text-warning"
            />
            <div class="min-w-0 flex-1 text-sm">
              <p class="font-medium">
                {{ overview.plans.find(p => p.slug === payment.planSlug)?.name ?? payment.planSlug }} · {{ BILLING_PERIOD_LABELS[payment.period] }} · <span class="tabular">{{ formatIDR(payment.amount) }}</span>
              </p>
              <p class="text-xs text-muted">
                {{ payment.orderId }} · berlaku sampai {{ formatDateId(payment.expiresAt, tz) }}
              </p>
            </div>
            <UButton
              v-if="payment.redirectUrl"
              label="Lanjutkan bayar"
              size="sm"
              :disabled="!canCheckout"
              @click="resumePayment(payment)"
            />
            <UButton
              label="Batalkan"
              size="sm"
              variant="ghost"
              color="neutral"
              :disabled="overview.impersonating"
              @click="cancelPending(payment)"
            />
          </div>
        </UCard>
      </section>

      <!-- Pilihan paket -->
      <section class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-lg font-semibold">
            Pilih paket
          </h2>
          <div class="flex items-center gap-2">
            <UTabs
              v-model="period"
              :items="[{ label: 'Bulanan', value: 'monthly' }, { label: 'Tahunan', value: 'yearly' }]"
              :content="false"
              size="sm"
            />
            <UBadge
              v-if="yearlySaving && yearlySaving > 0"
              :label="`Hemat ${yearlySaving}%`"
              color="success"
              variant="subtle"
            />
          </div>
        </div>

        <UAlert
          v-if="!overview.checkoutAvailable"
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          :title="overview.impersonating ? 'Pembayaran tidak tersedia selama sesi dukungan.' : 'Pembayaran online sedang tidak tersedia. Hubungi tim kami untuk berlangganan.'"
        />

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <UCard
            v-for="plan in overview.plans"
            :key="plan.id"
            :class="sub?.planSlug === plan.slug ? 'ring-2 ring-primary' : ''"
            :ui="{ body: 'flex h-full flex-col gap-4' }"
          >
            <div>
              <p class="font-semibold">
                {{ plan.name }}
              </p>
              <p class="mt-1 min-h-10 text-sm text-muted">
                {{ plan.description }}
              </p>
            </div>
            <p>
              <template v-if="price(plan) > 0">
                <span class="tabular text-2xl font-semibold">{{ formatIDR(price(plan)) }}</span>
                <span class="text-sm text-muted">/{{ period === 'yearly' ? 'tahun' : 'bulan' }}</span>
              </template>
              <span
                v-else-if="plan.slug === 'free' || plan.priceMonthly === 0 && plan.priceYearly === 0 && plan.limits.employees !== -1"
                class="text-2xl font-semibold"
              >Gratis</span>
              <span
                v-else
                class="text-lg font-semibold"
              >Hubungi kami</span>
            </p>
            <ul class="flex-1 space-y-1.5 text-sm">
              <li
                v-for="item in highlights(plan)"
                :key="item"
                class="flex gap-2"
              >
                <UIcon
                  name="i-lucide-check"
                  class="mt-0.5 size-4 shrink-0 text-success"
                />
                <span>{{ item }}</span>
              </li>
            </ul>
            <UButton
              v-if="price(plan) > 0"
              :label="isCurrent(plan) ? 'Perpanjang' : (sub?.planSlug === plan.slug ? 'Bayar paket ini' : 'Pilih paket')"
              :variant="isCurrent(plan) ? 'outline' : 'solid'"
              block
              :loading="busyPlan === plan.slug"
              :disabled="!canCheckout || (busyPlan !== null && busyPlan !== plan.slug)"
              @click="choose(plan)"
            />
            <UButton
              v-else-if="plan.limits.employees === -1"
              to="mailto:support@nexadream.id"
              label="Hubungi kami"
              variant="outline"
              block
            />
          </UCard>
        </div>
        <p class="flex items-start gap-2 text-sm text-muted">
          <UIcon
            name="i-lucide-shield-check"
            class="mt-0.5 size-4 shrink-0 text-success"
          />
          Pembayaran diproses lewat Nexadream Payment Hub (kartu, VA bank, e-wallet, QRIS). Data Anda tidak pernah dihapus saat paket berubah.
        </p>
      </section>
    </div>
  </PagePanel>
</template>
