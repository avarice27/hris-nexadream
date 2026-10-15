<script setup lang="ts">
definePageMeta({ layout: 'auth-tenant' })
useHead({ title: 'Atur ulang kata sandi' })
</script>

<template>
  <ResetPasswordForm
    endpoint="/api/app/auth/reset-password"
    login-route="/app/auth/login"
  />
</template>
