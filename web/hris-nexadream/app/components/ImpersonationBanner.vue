<script setup lang="ts">
import { TENANT_TOKEN_KEY } from '#shared/utils/auth-rules'

// Selalu tampil selama sesi dukungan di konsol perusahaan. "Selesai" mengakhiri sesi dan
// menghapus token perusahaan dari browser ini.
const auth = useTenantAuth()
const stopping = ref(false)

async function stop() {
  stopping.value = true
  try {
    await apiFetch('/api/app/auth/stop-impersonation', { method: 'POST' })
  } catch {
    // Token mungkin sudah habis; tetap bersihkan.
  }
  localStorage.removeItem(TENANT_TOKEN_KEY)
  auth.reset()
  // Tutup tab hanya bila tab ini memang dibuka dari back-office (pop-up); jika tidak,
  // kembali ke /admin di tab yang sama (sesi staf tidak tersentuh).
  if (window.opener && !window.opener.closed) {
    window.close()
    return
  }
  window.location.href = '/admin/tenants'
}
</script>

<template>
  <div
    v-if="auth.impersonating.value"
    class="sticky top-0 z-50 flex flex-wrap items-center gap-x-3 gap-y-1 bg-warning px-4 py-2 text-sm text-inverted"
    role="alert"
  >
    <UIcon
      name="i-lucide-user-cog"
      class="size-4 shrink-0"
    />
    <span class="min-w-0 flex-1">
      Sesi dukungan: Anda masuk sebagai <strong>{{ auth.profile.value?.name }}</strong> di {{ auth.tenant.value?.name }}.
      Pembayaran & data sensitif terkunci.
    </span>
    <UButton
      label="Selesai"
      size="xs"
      color="neutral"
      variant="solid"
      :loading="stopping"
      @click="stop"
    />
  </div>
</template>
