<script setup lang="ts">
// Tombol "Masuk dengan Google" — hanya tampil bila penyedia sudah dikonfigurasi di server.
const props = defineProps<{ mode: 'login' | 'register', redirect?: string }>()

const { data } = await useFetch<{ providers: string[] }>('/api/app/auth/providers', { server: false, default: () => ({ providers: [] }) })
const hasGoogle = computed(() => data.value?.providers.includes('google') ?? false)
const googleHref = computed(() => {
  const query = props.redirect ? `?redirect=${encodeURIComponent(props.redirect)}` : ''
  return `/api/app/auth/oauth/google/start${query}`
})
</script>

<template>
  <div
    v-if="hasGoogle"
    class="space-y-4"
  >
    <UButton
      :href="googleHref"
      external
      block
      color="neutral"
      variant="outline"
      icon="i-simple-icons-google"
      :label="mode === 'register' ? 'Daftar dengan Google' : 'Masuk dengan Google'"
    />
    <p
      v-if="mode === 'register'"
      class="text-center text-xs text-muted"
    >
      Dengan mendaftar lewat Google, Anda menyetujui
      <ULink
        to="/page/terms"
        class="underline"
      >syarat & ketentuan</ULink>
      serta
      <ULink
        to="/page/privacy"
        class="underline"
      >kebijakan privasi</ULink>.
    </p>
    <USeparator label="atau" />
  </div>
</template>
