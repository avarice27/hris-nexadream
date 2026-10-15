<script setup lang="ts">
// Kembali dari halaman pembayaran. Parameter URL hanya untuk tampilan — siapa pun bisa membuatnya.
// Status dibaca dari API kita (yang mengonfirmasi ke gateway), dicoba ulang sekali bila masih pending.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Status pembayaran' })

const route = useRoute()
const entitlements = useEntitlements()
const reference = typeof route.query.reference === 'string' ? route.query.reference : (typeof route.query.order_id === 'string' ? route.query.order_id : '')

const state = ref<'checking' | 'paid' | 'pending' | 'failed' | 'unknown'>('checking')

async function readStatus(): Promise<string | null> {
  try {
    return (await apiFetch<{ status: string }>(`/api/app/subscription/payments/status/${encodeURIComponent(reference)}`)).status
  } catch {
    return null
  }
}

onMounted(async () => {
  // Buang query agar muat ulang tidak mengulang.
  history.replaceState(null, '', '/app/billing/return')
  if (!reference) {
    state.value = 'unknown'
    return
  }
  let status = await readStatus()
  if (status === 'pending' || status === 'challenge') {
    await new Promise(resolve => setTimeout(resolve, 2500))
    status = await readStatus()
  }
  state.value = status === 'paid' ? 'paid' : (status === 'pending' || status === 'challenge') ? 'pending' : status ? 'failed' : 'unknown'
  if (state.value === 'paid') {
    await Promise.all([entitlements.refresh(), useTenantAuth().fetchProfile()])
    useBilling().overview.value = null
  }
})

const view = computed(() => ({
  checking: { icon: 'i-lucide-loader-circle', color: 'text-muted', title: 'Memeriksa pembayaran…', text: 'Mohon tunggu sebentar.' },
  paid: { icon: 'i-lucide-circle-check', color: 'text-success', title: 'Pembayaran berhasil', text: 'Paket Anda sudah aktif. Terima kasih!' },
  pending: { icon: 'i-lucide-hourglass', color: 'text-warning', title: 'Pembayaran sedang diproses', text: 'Kami akan memperbarui paket otomatis begitu pembayaran diterima. Anda bisa menutup halaman ini.' },
  failed: { icon: 'i-lucide-circle-x', color: 'text-error', title: 'Pembayaran belum berhasil', text: 'Tidak ada dana yang ditagih untuk transaksi ini. Silakan coba lagi.' },
  unknown: { icon: 'i-lucide-circle-help', color: 'text-muted', title: 'Status tidak diketahui', text: 'Buka halaman Langganan untuk melihat status terbaru.' }
}[state.value]))
</script>

<template>
  <PagePanel title="Status pembayaran">
    <div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <UIcon
        :name="view.icon"
        class="size-12"
        :class="[view.color, state === 'checking' ? 'animate-spin' : '']"
      />
      <h2 class="text-xl font-semibold">
        {{ view.title }}
      </h2>
      <p class="max-w-md text-sm text-muted">
        {{ view.text }}
      </p>
      <UButton
        v-if="state !== 'checking'"
        to="/app/billing"
        label="Kembali ke Langganan"
        class="mt-2"
      />
    </div>
  </PagePanel>
</template>
