<script setup lang="ts">
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth-rules'
import { isValidIndonesianPhone } from '#shared/utils/phone'

definePageMeta({ layout: 'auth-tenant' })
useHead({ title: 'Daftar' })

const auth = useTenantAuth()

const schema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.'),
  companyName: z.string().trim().min(2, 'Nama perusahaan minimal 2 karakter.'),
  email: z.email('Masukkan alamat email yang valid.'),
  phone: z.string().trim().refine(isValidIndonesianPhone, 'Masukkan nomor HP Indonesia yang valid.'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`),
  acceptTerms: z.boolean().refine(v => v, 'Anda perlu menyetujui syarat & ketentuan serta kebijakan privasi.')
})
const state = reactive({ name: '', companyName: '', email: '', phone: '', password: '', acceptTerms: false })
const loading = ref(false)
const errorMessage = ref('')

async function onSubmit() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await apiFetch<{ token: string }>('/api/app/auth/register', { method: 'POST', body: { ...state } })
    await auth.adoptToken(result.token)
    await navigateTo('/app/onboarding')
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
        Daftarkan perusahaan Anda
      </h1>
      <p class="text-sm text-muted">
        Uji coba paket Business 14 hari, tanpa kartu kredit.
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
        label="Nama Anda"
        name="name"
      >
        <UInput
          v-model="state.name"
          autocomplete="name"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Nama perusahaan"
        name="companyName"
      >
        <UInput
          v-model="state.companyName"
          autocomplete="organization"
          placeholder="PT Maju Bersama"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Email kerja"
        name="email"
      >
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="email"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Nomor HP"
        name="phone"
      >
        <UInput
          v-model="state.phone"
          type="tel"
          autocomplete="tel"
          placeholder="0812 3456 7890"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Kata sandi"
        name="password"
        :hint="`Minimal ${PASSWORD_MIN_LENGTH} karakter`"
      >
        <PasswordInput
          v-model="state.password"
          autocomplete="new-password"
        />
      </UFormField>
      <UFormField name="acceptTerms">
        <UCheckbox v-model="state.acceptTerms">
          <template #label>
            <span class="text-sm">
              Saya menyetujui <ULink
                to="/page/terms"
                target="_blank"
                class="text-primary"
              >Syarat & Ketentuan</ULink>
              serta <ULink
                to="/page/privacy"
                target="_blank"
                class="text-primary"
              >Kebijakan Privasi</ULink>.
            </span>
          </template>
        </UCheckbox>
      </UFormField>
      <UButton
        type="submit"
        label="Buat akun"
        block
        :loading="loading"
      />
    </UForm>

    <p class="text-center text-sm text-muted">
      Sudah punya akun?
      <ULink
        to="/app/auth/login"
        class="font-medium text-primary"
      >
        Masuk
      </ULink>
    </p>
  </div>
</template>
