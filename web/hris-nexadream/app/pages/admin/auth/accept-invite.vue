<script setup lang="ts">
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth-rules'

definePageMeta({ layout: 'auth-admin' })
useHead({ title: 'Terima undangan' })

interface InvitationPreview { email: string, name: string | null, roleName: string, inviterName: string | null, expiresAt: string }

const auth = usePlatformAuth()
const route = useRoute()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')

const schema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`)
})
const state = reactive({ name: '', password: '' })
const loading = ref(false)
const errorMessage = ref('')

const preview = ref<InvitationPreview | null>(null)
const previewError = ref('')
const loadingPreview = ref(true)

onMounted(async () => {
  if (!token.value) {
    previewError.value = 'Tautan undangan tidak valid.'
    loadingPreview.value = false
    return
  }
  try {
    preview.value = await apiFetch<InvitationPreview>('/api/admin/auth/invitation', { query: { token: token.value } })
    state.name = preview.value.name ?? ''
  } catch (error) {
    previewError.value = extractErrorMessage(error)
  } finally {
    loadingPreview.value = false
  }
})

async function onSubmit() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await apiFetch<{ token: string }>('/api/admin/auth/accept-invite', {
      method: 'POST',
      body: { token: token.value, ...state }
    })
    await auth.adoptToken(result.token)
    await navigateTo('/admin/dashboard')
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
      Terima undangan staf
    </h1>
    <USkeleton
      v-if="loadingPreview"
      class="h-24 w-full"
    />
    <UAlert
      v-else-if="previewError"
      color="error"
      variant="subtle"
      icon="i-lucide-link-2-off"
      :title="previewError"
    />
    <template v-else-if="preview">
      <p class="text-sm text-muted">
        <span v-if="preview.inviterName">{{ preview.inviterName }} mengundang </span>
        <strong class="text-default">{{ preview.email }}</strong> sebagai <strong class="text-default">{{ preview.roleName }}</strong>.
      </p>
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
          label="Nama lengkap"
          name="name"
        >
          <UInput
            v-model="state.name"
            autocomplete="name"
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
        <UButton
          type="submit"
          label="Gabung"
          block
          :loading="loading"
        />
      </UForm>
    </template>
  </div>
</template>
