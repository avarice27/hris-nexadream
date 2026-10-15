<script setup lang="ts">
definePageMeta({ layout: 'auth-tenant' })
useHead({ title: 'Lupa kata sandi' })
</script>

<template>
  <ForgotPasswordForm
    endpoint="/api/app/auth/forgot-password"
    login-route="/app/auth/login"
  />
</template>
