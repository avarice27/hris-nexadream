<script setup lang="ts">
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth-rules'
import { formatDateId } from '#shared/utils/format'

definePageMeta({ layout: 'auth-tenant' })
useHead({ title: 'Terima undangan' })

interface InvitationPreview {
  email: string
  name: string | null
  tenantName: string
  roleLabel: string
  expiresAt: string
  hasAccount: boolean
  needsPassword: boolean
  blockedByTenantName: string | null
}

const auth = useTenantAuth()
const route = useRoute()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')

const preview = ref<InvitationPreview | null>(null)
const previewError = ref('')
const loadingPreview = ref(true)
const form = reactive({ name: '', password: '' })
const submitting = ref(false)
const errorMessage = ref('')

onMounted(async () => {
  if (!token.value) {
    previewError.value = 'Tautan undangan tidak valid.'
    loadingPreview.value = false
    return
  }
  try {
    preview.value = await apiFetch<InvitationPreview>('/api/app/auth/invitation', { query: { token: token.value } })
    form.name = preview.value.name ?? ''
  } catch (error) {
    previewError.value = extractErrorMessage(error)
  } finally {
    loadingPreview.value = false
  }
})

async function accept() {
  errorMessage.value = ''
  if (form.name.trim().length < 2) {
    errorMessage.value = 'Nama minimal 2 karakter.'
    return
  }
  if (preview.value?.needsPassword && form.password.length < PASSWORD_MIN_LENGTH) {
    errorMessage.value = `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`
    return
  }
  submitting.value = true
  try {
    const result = await apiFetch<{ token: string }>('/api/app/auth/accept-invite', {
      method: 'POST',
      body: { token: token.value, name: form.name, password: preview.value?.needsPassword ? form.password : undefined }
    })
    await auth.adoptToken(result.token)
    await navigateTo(auth.landingRoute.value)
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold">
      Terima undangan
    </h1>

    <USkeleton
      v-if="loadingPreview"
      class="h-32 w-full"
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
        Anda diundang bergabung ke <strong class="text-default">{{ preview.tenantName }}</strong>
        sebagai <strong class="text-default">{{ preview.roleLabel }}</strong>
        dengan email <strong class="text-default">{{ preview.email }}</strong>.
        Undangan berlaku sampai {{ formatDateId(preview.expiresAt) }}.
      </p>

      <UAlert
        v-if="preview.blockedByTenantName"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="`Email ini masih terhubung ke ${preview.blockedByTenantName}.`"
        description="Satu akun hanya bisa terhubung ke satu perusahaan. Minta pengundang memakai email lain."
      />
      <template v-else>
        <UAlert
          v-if="auth.isAuthenticated.value"
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          title="Anda sedang masuk dengan akun lain. Menerima undangan akan berpindah ke akun undangan ini."
        />
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="errorMessage"
        />
        <form
          class="space-y-4"
          @submit.prevent="accept"
        >
          <UFormField label="Nama lengkap">
            <UInput
              v-model="form.name"
              autocomplete="name"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="preview.needsPassword"
            label="Buat kata sandi"
            :hint="`Minimal ${PASSWORD_MIN_LENGTH} karakter`"
          >
            <PasswordInput
              v-model="form.password"
              autocomplete="new-password"
            />
          </UFormField>
          <p
            v-else
            class="text-xs text-muted"
          >
            Akun Anda sudah ada — setelah bergabung, masuk seperti biasa dengan kata sandi Anda.
          </p>
          <UButton
            type="submit"
            label="Gabung"
            block
            :loading="submitting"
          />
        </form>
      </template>
    </template>
  </div>
</template>
