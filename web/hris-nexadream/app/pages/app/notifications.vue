<script setup lang="ts">
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Notifikasi' })

const auth = useTenantAuth()
const isEss = computed(() => auth.hasRole('employee'))
</script>

<template>
  <div
    v-if="isEss"
    class="space-y-4"
  >
    <h1 class="text-xl font-semibold">
      Notifikasi
    </h1>
    <NotificationList
      audience="tenant"
      :timezone="auth.displayTimezone.value"
    />
  </div>
  <PagePanel
    v-else
    title="Notifikasi"
  >
    <NotificationList
      audience="tenant"
      :timezone="auth.displayTimezone.value"
    />
  </PagePanel>
</template>
