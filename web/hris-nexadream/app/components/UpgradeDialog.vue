<script setup lang="ts">
import { FEATURE_META, LIMIT_META, formatLimit, type PlanFeatures, type PlanLimits } from '#shared/utils/plans'
import { formatIDR } from '#shared/utils/format'

// Dipasang SEKALI di shell; dibuka oleh setiap 402 yang tertangkap (handlePlanError).
interface PlanOption {
  id: string
  slug: string
  name: string
  description: string | null
  priceMonthly: number
  limits: PlanLimits
  features: PlanFeatures
}

const entitlements = useEntitlements()
const auth = useTenantAuth()
const dialog = entitlements.upgradeDialog
const canBuy = computed(() => auth.hasAbility('billing.manage'))

const plans = ref<PlanOption[]>([])
const currentPlanSlug = ref('')
const loadingPlans = ref(false)

const open = computed({
  get: () => dialog.value.open,
  set: (v: boolean) => {
    if (!v) entitlements.closeDialog()
  }
})

watch(() => dialog.value.open, async (isOpen) => {
  if (!isOpen || plans.value.length) return
  loadingPlans.value = true
  try {
    const response = await apiFetch<{ items: PlanOption[], currentPlanSlug: string }>('/api/app/plans')
    plans.value = response.items
    currentPlanSlug.value = response.currentPlanSlug
  } catch {
    plans.value = []
  } finally {
    loadingPlans.value = false
  }
})

/** Paket yang menyelesaikan masalahnya: punya fitur tsb, atau batas lebih tinggi dari sekarang. */
const suggestions = computed(() => {
  const { feature, limit } = dialog.value
  const currentLimit = limit ? entitlements.limit(limit) : 0
  return plans.value.filter((plan) => {
    if (plan.slug === currentPlanSlug.value) return false
    if (feature) return plan.features[feature]
    if (limit) return plan.limits[limit] === -1 || plan.limits[limit] > currentLimit
    return true
  }).slice(0, 3)
})

const headline = computed(() => {
  if (dialog.value.feature) return `Buka ${FEATURE_META[dialog.value.feature].label}`
  if (dialog.value.limit) return `Tambah ${LIMIT_META[dialog.value.limit].label.toLowerCase()}`
  return 'Tingkatkan paket'
})

function planHighlight(plan: PlanOption): string {
  const { feature, limit } = dialog.value
  if (limit) return `${LIMIT_META[limit].label}: ${formatLimit(limit, plan.limits[limit])}`
  if (feature) return `Termasuk ${FEATURE_META[feature].label}`
  return plan.description ?? ''
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="headline"
    :description="dialog.message"
  >
    <template #body>
      <div class="space-y-4">
        <div
          v-if="loadingPlans"
          class="space-y-2"
        >
          <USkeleton
            v-for="i in 2"
            :key="i"
            class="h-16 w-full"
          />
        </div>
        <ul
          v-else-if="suggestions.length"
          class="space-y-2"
        >
          <li
            v-for="plan in suggestions"
            :key="plan.id"
            class="flex items-center justify-between gap-3 rounded-md border border-default p-3"
          >
            <div class="min-w-0">
              <p class="font-medium">
                {{ plan.name }}
              </p>
              <p class="text-xs text-muted">
                {{ planHighlight(plan) }}
              </p>
            </div>
            <p class="shrink-0 text-right text-sm">
              <template v-if="plan.priceMonthly > 0">
                <span class="tabular font-semibold">{{ formatIDR(plan.priceMonthly) }}</span><span class="text-xs text-muted">/bulan</span>
              </template>
              <span
                v-else
                class="text-muted"
              >Hubungi kami</span>
            </p>
          </li>
        </ul>
        <p class="flex items-start gap-2 text-sm text-muted">
          <UIcon
            name="i-lucide-shield-check"
            class="mt-0.5 size-4 shrink-0 text-success"
          />
          Data Anda tidak pernah dihapus saat paket berubah. Semua kembali aktif begitu paket ditingkatkan.
        </p>
        <UAlert
          v-if="!canBuy"
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          title="Hanya pemilik perusahaan yang dapat mengubah paket."
          description="Sampaikan kebutuhan ini kepada pemilik akun perusahaan Anda."
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Nanti saja"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />
        <UButton
          v-if="canBuy"
          to="/app/billing"
          label="Lihat paket"
          icon="i-lucide-sparkles"
          @click="open = false"
        />
      </div>
    </template>
  </UModal>
</template>
