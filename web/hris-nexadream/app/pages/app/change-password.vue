<script setup lang="ts">
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Ubah kata sandi' })

const auth = useTenantAuth()
const isEss = computed(() => auth.hasRole('employee'))
</script>

<template>
  <div
    v-if="isEss"
    class="space-y-4"
  >
    <h1 class="text-xl font-semibold">
      Ubah kata sandi
    </h1>
    <ChangePasswordForm
      endpoint="/api/app/change-password"
      :has-password="auth.profile.value?.hasPassword ?? true"
    />
  </div>
  <PagePanel
    v-else
    title="Ubah kata sandi"
  >
    <ChangePasswordForm
      endpoint="/api/app/change-password"
      :has-password="auth.profile.value?.hasPassword ?? true"
    />
  </PagePanel>
</template>
