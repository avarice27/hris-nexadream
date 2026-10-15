<script setup lang="ts">
// Isi halaman profil sendiri (dipakai shell manajemen dan ESS).
import { UPLOAD_PURPOSES } from '#shared/utils/uploads'
import { TENANT_ROLE_PRESETS } from '#shared/utils/tenant-abilities'

const auth = useTenantAuth()
const toast = useApiToast()

const form = reactive({ name: auth.profile.value?.name ?? '', phone: auth.profile.value?.phone ?? '' })
const saving = ref(false)
const uploading = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

async function save() {
  saving.value = true
  try {
    await apiFetch('/api/app/profile', { method: 'PATCH', body: { ...form } })
    await auth.fetchProfile()
    toast.success('Profil disimpan')
  } catch (error) {
    toast.error(error)
  } finally {
    saving.value = false
  }
}

async function onAvatarSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    await uploadImage('/api/app/uploads/avatar', file, UPLOAD_PURPOSES.avatar.clientResizePx)
    await auth.fetchProfile()
    toast.success('Foto profil diperbarui')
  } catch (error) {
    toast.error(error)
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function removeAvatar() {
  try {
    await apiFetch('/api/app/profile/avatar', { method: 'DELETE' })
    await auth.fetchProfile()
    toast.success('Foto profil dihapus')
  } catch (error) {
    toast.error(error)
  }
}
</script>

<template>
  <div class="max-w-lg space-y-6">
    <div class="flex items-center gap-4">
      <UAvatar
        :src="auth.profile.value?.avatarUrl ?? undefined"
        :alt="auth.profile.value?.name"
        size="3xl"
      />
      <div class="space-y-1">
        <div class="flex gap-2">
          <UButton
            label="Ganti foto"
            icon="i-lucide-camera"
            size="sm"
            variant="outline"
            :loading="uploading"
            @click="fileInput?.click()"
          />
          <UButton
            v-if="auth.profile.value?.avatarUrl"
            label="Hapus"
            size="sm"
            variant="ghost"
            color="neutral"
            @click="removeAvatar"
          />
        </div>
        <p class="text-xs text-muted">
          Foto dikecilkan otomatis. Data lokasi (EXIF) dihapus.
        </p>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        class="hidden"
        @change="onAvatarSelected"
      >
    </div>

    <form
      class="space-y-4"
      @submit.prevent="save"
    >
      <UFormField label="Nama lengkap">
        <UInput
          v-model="form.name"
          autocomplete="name"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Email"
        help="Email dipakai untuk masuk dan tidak bisa diubah di sini."
      >
        <UInput
          :model-value="auth.profile.value?.email"
          disabled
          class="w-full"
        />
      </UFormField>
      <UFormField label="Nomor HP">
        <UInput
          v-model="form.phone"
          type="tel"
          autocomplete="tel"
          class="w-full"
        />
      </UFormField>
      <p
        v-if="auth.profile.value?.tenantRole"
        class="text-sm text-muted"
      >
        Peran: {{ TENANT_ROLE_PRESETS[auth.profile.value.tenantRole].label }} di {{ auth.tenant.value?.name }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          type="submit"
          label="Simpan"
          :loading="saving"
        />
        <UButton
          to="/app/change-password"
          label="Ubah kata sandi"
          variant="outline"
          color="neutral"
        />
      </div>
    </form>
  </div>
</template>
