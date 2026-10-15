<script setup lang="ts">
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth-rules'

const props = defineProps<{ endpoint: string, hasPassword: boolean }>()
const toast = useToast()

const schema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`),
  confirm: z.string()
}).refine(v => v.newPassword === v.confirm, { message: 'Konfirmasi kata sandi tidak cocok.', path: ['confirm'] })
const state = reactive({ currentPassword: '', newPassword: '', confirm: '' })
const loading = ref(false)
const errorMessage = ref('')

async function onSubmit() {
  loading.value = true
  errorMessage.value = ''
  try {
    await apiFetch(props.endpoint, {
      method: 'POST',
      body: { currentPassword: state.currentPassword || undefined, newPassword: state.newPassword }
    })
    Object.assign(state, { currentPassword: '', newPassword: '', confirm: '' })
    toast.add({ title: 'Kata sandi berhasil diubah', color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard class="max-w-lg">
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
      class="mb-4"
    />
    <UForm
      :schema="schema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField
        v-if="hasPassword"
        label="Kata sandi saat ini"
        name="currentPassword"
      >
        <PasswordInput
          v-model="state.currentPassword"
          autocomplete="current-password"
        />
      </UFormField>
      <UFormField
        label="Kata sandi baru"
        name="newPassword"
        :hint="`Minimal ${PASSWORD_MIN_LENGTH} karakter`"
      >
        <PasswordInput
          v-model="state.newPassword"
          autocomplete="new-password"
        />
      </UFormField>
      <UFormField
        label="Ulangi kata sandi baru"
        name="confirm"
      >
        <PasswordInput
          v-model="state.confirm"
          autocomplete="new-password"
        />
      </UFormField>
      <UButton
        type="submit"
        :label="hasPassword ? 'Ubah kata sandi' : 'Buat kata sandi'"
        :loading="loading"
      />
    </UForm>
  </UCard>
</template>
