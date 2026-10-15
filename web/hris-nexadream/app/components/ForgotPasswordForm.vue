<script setup lang="ts">
import { z } from 'zod'

// Dipakai kedua audiens. Respons selalu sukses (tanpa enumerasi akun).
const props = defineProps<{ endpoint: string, loginRoute: string }>()

const schema = z.object({ email: z.email('Masukkan alamat email yang valid.') })
const state = reactive({ email: '' })
const loading = ref(false)
const sent = ref(false)
const errorMessage = ref('')

async function onSubmit() {
  loading.value = true
  errorMessage.value = ''
  try {
    await apiFetch(props.endpoint, { method: 'POST', body: { ...state } })
    sent.value = true
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
        Lupa kata sandi
      </h1>
      <p class="text-sm text-muted">
        Masukkan email akun Anda. Kami akan mengirim tautan untuk mengatur ulang kata sandi.
      </p>
    </div>

    <UAlert
      v-if="sent"
      color="success"
      variant="subtle"
      icon="i-lucide-mail-check"
      title="Periksa email Anda"
      description="Jika email tersebut terdaftar, tautan atur ulang sudah dikirim dan berlaku selama 2 jam."
    />
    <template v-else>
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
          name="email"
        >
          <UInput
            v-model="state.email"
            type="email"
            autocomplete="email"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          label="Kirim tautan"
          block
          :loading="loading"
        />
      </UForm>
    </template>

    <p class="text-center text-sm">
      <ULink
        :to="loginRoute"
        class="text-primary"
      >
        Kembali ke halaman masuk
      </ULink>
    </p>
  </div>
</template>
