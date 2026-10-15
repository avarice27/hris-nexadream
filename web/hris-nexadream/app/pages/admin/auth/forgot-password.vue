<script setup lang="ts">
definePageMeta({ layout: 'auth-admin' })
useHead({ title: 'Lupa kata sandi' })
</script>

<template>
  <ForgotPasswordForm
    endpoint="/api/admin/auth/forgot-password"
    login-route="/admin/auth/login"
  />
</template>
