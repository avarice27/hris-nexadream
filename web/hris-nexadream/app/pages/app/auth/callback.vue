<script setup lang="ts">
import { safeRedirectPath } from '#shared/utils/auth-rules'

// Penutup alur Google: tukar kode sekali pakai menjadi sesi, lalu buang kode dari URL.
definePageMeta({ layout: 'auth-tenant' })
useHead({ title: 'Memproses masuk…' })

const auth = useTenantAuth()
const route = useRoute()
const errorMessage = ref('')

onMounted(async () => {
  const code = typeof route.query.code === 'string' ? route.query.code : ''
  const redirect = route.query.redirect
  window.history.replaceState(null, '', '/app/auth/callback')
  if (!code) {
    errorMessage.value = 'Tautan masuk tidak valid. Silakan masuk lagi.'
    return
  }
  try {
    const result = await apiFetch<{ token: string, isNew?: boolean }>('/api/app/auth/exchange', { method: 'POST', body: { code } })
    await auth.adoptToken(result.token)
    await navigateTo(result.isNew ? '/app/onboarding' : safeRedirectPath(redirect, auth.landingRoute.value), { replace: true })
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
})
</script>

<template>
  <div class="space-y-6">
    <template v-if="errorMessage">
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
      />
      <UButton
        to="/app/auth/login"
        label="Kembali ke halaman masuk"
        block
      />
    </template>
    <div
      v-else
      class="flex items-center gap-3 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-5 animate-spin"
      />
      Memproses masuk…
    </div>
  </div>
</template>
