<script setup lang="ts">
import { z } from 'zod'
import { safeRedirectPath } from '#shared/utils/auth-rules'

definePageMeta({ layout: 'auth-admin' })
useHead({ title: 'Masuk back-office' })

const auth = usePlatformAuth()
const route = useRoute()

const schema = z.object({
  identifier: z.email('Masukkan alamat email yang valid.'),
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
    await navigateTo(safeRedirectPath(route.query.redirect, '/admin/dashboard'))
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold">
      Masuk back-office
    </h1>
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
        label="Email"
        name="identifier"
      >
        <UInput
          v-model="state.identifier"
          type="email"
          autocomplete="username"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Kata sandi"
        name="password"
      >
        <template #hint>
          <ULink
            to="/admin/auth/forgot-password"
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
  </div>
</template>
