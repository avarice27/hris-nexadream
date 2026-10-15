<script setup lang="ts">
import { formatDateId } from '#shared/utils/format'

// Banner uji coba / masa tenggang. Hanya untuk peran yang bisa membeli (pemilik).
const entitlements = useEntitlements()
const auth = useTenantAuth()
const dismissed = useState<boolean>('trial-banner:dismissed', () => false)

const banner = computed(() => {
  const e = entitlements.data.value
  if (!e || !auth.hasAbility('billing.manage') || dismissed.value) return null
  if (e.isInGrace && e.graceEndsAt) {
    return {
      color: 'error' as const,
      icon: 'i-lucide-credit-card',
      text: `Pembayaran langganan belum berhasil. Selesaikan sebelum ${formatDateId(e.graceEndsAt, auth.displayTimezone.value)} agar fitur tetap aktif.`,
      action: 'Bayar sekarang'
    }
  }
  if (e.isTrialing && e.trialDaysRemaining !== null) {
    const days = e.trialDaysRemaining
    return {
      color: (days <= 3 ? 'warning' : 'info') as 'warning' | 'info',
      icon: 'i-lucide-sparkles',
      text: days <= 0
        ? `Uji coba paket ${e.planName} berakhir hari ini.`
        : `Uji coba paket ${e.planName} tersisa ${days} hari (sampai ${formatDateId(e.trialEndsAt, auth.displayTimezone.value)}).`,
      action: 'Pilih paket'
    }
  }
  return null
})
</script>

<template>
  <div
    v-if="banner"
    class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm"
    :class="{
      'border-error/30 bg-error/10': banner.color === 'error',
      'border-warning/30 bg-warning/10': banner.color === 'warning',
      'border-info/30 bg-info/10': banner.color === 'info'
    }"
    role="status"
  >
    <UIcon
      :name="banner.icon"
      class="size-4 shrink-0"
    />
    <span class="min-w-0 flex-1">{{ banner.text }}</span>
    <UButton
      :label="banner.action"
      to="/app/billing"
      size="xs"
      :color="banner.color"
      variant="solid"
    />
    <UButton
      icon="i-lucide-x"
      size="xs"
      variant="ghost"
      color="neutral"
      aria-label="Tutup pemberitahuan"
      @click="dismissed = true"
    />
  </div>
</template>
