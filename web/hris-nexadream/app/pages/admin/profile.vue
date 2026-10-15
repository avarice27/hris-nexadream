<script setup lang="ts">
import { UPLOAD_PURPOSES } from '#shared/utils/uploads'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Profil' })

const auth = usePlatformAuth()
const toast = useToast()
const form = reactive({ name: auth.profile.value?.name ?? '', phone: auth.profile.value?.phone ?? '' })
const saving = ref(false)
const uploading = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

async function save() {
  saving.value = true
  try {
    await apiFetch('/api/admin/profile', { method: 'PATCH', body: form })
    await auth.fetchProfile()
    toast.add({ title: 'Profil disimpan', color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: extractErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    saving.value = false
  }
}

async function onAvatar(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    await uploadImage('/api/admin/uploads/avatar', file, UPLOAD_PURPOSES.avatar.clientResizePx)
    await auth.fetchProfile()
    toast.add({ title: 'Foto profil diperbarui', color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: extractErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>

<template>
  <PagePanel title="Profil">
    <div class="max-w-lg space-y-6">
      <div class="flex items-center gap-4">
        <UAvatar
          :src="auth.profile.value?.avatarUrl ?? undefined"
          :alt="auth.profile.value?.name"
          size="3xl"
        />
        <UButton
          label="Ganti foto"
          icon="i-lucide-camera"
          size="sm"
          variant="outline"
          :loading="uploading"
          @click="fileInput?.click()"
        />
        <input
          ref="fileInput"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          class="hidden"
          @change="onAvatar"
        >
      </div>
      <form
        class="space-y-4"
        @submit.prevent="save"
      >
        <UFormField label="Nama">
          <UInput
            v-model="form.name"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Email">
          <UInput
            :model-value="auth.profile.value?.email"
            disabled
            class="w-full"
          />
        </UFormField>
        <UFormField label="Telepon">
          <UInput
            v-model="form.phone"
            type="tel"
            class="w-full"
          />
        </UFormField>
        <p class="text-sm text-muted">
          Peran: {{ auth.profile.value?.role?.name }}
        </p>
        <div class="flex gap-2">
          <UButton
            type="submit"
            label="Simpan"
            :loading="saving"
          />
          <UButton
            to="/admin/change-password"
            label="Ubah kata sandi"
            variant="outline"
            color="neutral"
          />
        </div>
      </form>
    </div>
  </PagePanel>
</template>
