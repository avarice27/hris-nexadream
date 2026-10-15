<script setup lang="ts">
// Tampil saat superadmin masuk sebagai staf lain.
const auth = usePlatformAuth()
const { stopStaffImpersonation } = useAdminImpersonation()
const stopping = ref(false)

async function stop() {
  stopping.value = true
  await stopStaffImpersonation()
  stopping.value = false
}
</script>

<template>
  <div
    v-if="auth.impersonating.value"
    class="flex flex-wrap items-center gap-3 bg-warning px-4 py-2 text-sm text-inverted"
    role="alert"
  >
    <UIcon
      name="i-lucide-user-cog"
      class="size-4 shrink-0"
    />
    <span class="min-w-0 flex-1">Anda masuk sebagai staf <strong>{{ auth.profile.value?.name }}</strong> ({{ auth.profile.value?.role?.name }}).</span>
    <UButton
      label="Kembali ke akun saya"
      size="xs"
      color="neutral"
      variant="solid"
      :loading="stopping"
      @click="stop"
    />
  </div>
</template>
