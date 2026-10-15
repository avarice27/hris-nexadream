<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: 'Ubah kata sandi' })
</script>

<template>
  <PagePanel title="Ubah kata sandi">
    <ChangePasswordForm
      endpoint="/api/admin/change-password"
      has-password
    />
  </PagePanel>
</template>
