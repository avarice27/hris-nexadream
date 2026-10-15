<script setup lang="ts">
definePageMeta({ layout: 'auth-admin' })
useHead({ title: 'Atur ulang kata sandi' })
</script>

<template>
  <ResetPasswordForm
    endpoint="/api/admin/auth/reset-password"
    login-route="/admin/auth/login"
  />
</template>
