<script setup lang="ts">
import { z } from 'zod'
import { safeRedirectPath } from '#shared/utils/auth-rules'

definePageMeta({ layout: 'auth-tenant' })
useHead({ title: 'Masuk' })

const auth = useTenantAuth()
const route = useRoute()

const schema = z.object({
  identifier: z.string().trim().min(3, 'Masukkan email atau nomor HP.'),
  password: z.string().min(1, 'Masukkan kata sandi.')
})
const state = reactive({ identifier: '', password: '' })
const loading = ref(false)
const errorMessage = ref('')

async function onSubmit() {
  loading.value = true
  errorMessage.value = ''
  try {
    await auth.login({ ...state })
    await navigateTo(safeRedirectPath(route.query.redirect, auth.landingRoute.value))
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-xl font-semibold">
        Masuk ke akun Anda
      </h1>
      <p class="text-sm text-muted">
        Untuk pemilik, tim HR, atasan, dan karyawan.
      </p>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />

    <UForm
      :schema="schema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField
        label="Email atau nomor HP"
        name="identifier"
      >
        <UInput
          v-model="state.identifier"
          autocomplete="username"
          placeholder="nama@perusahaan.com"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Kata sandi"
        name="password"
      >
        <template #hint>
          <ULink
            to="/app/auth/forgot-password"
            class="text-sm"
          >
            Lupa kata sandi?
          </ULink>
        </template>
        <PasswordInput
          v-model="state.password"
          autocomplete="current-password"
        />
      </UFormField>
      <UButton
        type="submit"
        label="Masuk"
        block
        :loading="loading"
      />
    </UForm>

    <p class="text-center text-sm text-muted">
      Belum punya akun perusahaan?
      <ULink
        to="/app/auth/register"
        class="font-medium text-primary"
      >
        Daftar gratis
      </ULink>
    </p>
  </div>
</template>
