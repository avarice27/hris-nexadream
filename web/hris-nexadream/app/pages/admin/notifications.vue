<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: 'Notifikasi' })

const auth = usePlatformAuth()
</script>

<template>
  <PagePanel title="Notifikasi">
    <NotificationList
      audience="platform"
      :timezone="auth.displayTimezone.value"
    />
  </PagePanel>
</template>
