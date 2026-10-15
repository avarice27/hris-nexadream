<script setup lang="ts">
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth-rules'

const props = defineProps<{ endpoint: string, loginRoute: string }>()
const route = useRoute()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')

const schema = z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`),
  confirm: z.string()
}).refine(v => v.password === v.confirm, { message: 'Konfirmasi kata sandi tidak cocok.', path: ['confirm'] })
const state = reactive({ password: '', confirm: '' })
const loading = ref(false)
const done = ref(false)
const errorMessage = ref('')

async function onSubmit() {
  loading.value = true
  errorMessage.value = ''
  try {
    await apiFetch(props.endpoint, { method: 'POST', body: { token: token.value, password: state.password } })
    done.value = true
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
      Atur ulang kata sandi
    </h1>

    <UAlert
      v-if="!token"
      color="error"
      variant="subtle"
      icon="i-lucide-link-2-off"
      title="Tautan tidak valid"
      description="Buka tautan dari email atau minta tautan baru."
    />
    <template v-else-if="done">
      <UAlert
        color="success"
        variant="subtle"
        icon="i-lucide-check"
        title="Kata sandi berhasil diubah"
      />
      <UButton
        :to="loginRoute"
        label="Masuk sekarang"
        block
      />
    </template>
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
          label="Kata sandi baru"
          name="password"
          :hint="`Minimal ${PASSWORD_MIN_LENGTH} karakter`"
        >
          <PasswordInput
            v-model="state.password"
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
          label="Simpan kata sandi"
          block
          :loading="loading"
        />
      </UForm>
    </template>
  </div>
</template>
