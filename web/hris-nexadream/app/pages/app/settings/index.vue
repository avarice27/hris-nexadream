<script setup lang="ts">
import { TIMEZONE_OPTIONS } from '#shared/utils/settings'
import { UPLOAD_PURPOSES } from '#shared/utils/uploads'

definePageMeta({ layout: 'tenant' })
useHead({ title: 'Pengaturan perusahaan' })

const { settings, status, errorMessage, load, save } = useTenantSettings()
const toast = useApiToast()

const form = reactive({ name: '', legalName: '', industry: '', phone: '', email: '', timezone: 'Asia/Jakarta' })
const npwpInput = ref('')
const editingNpwp = ref(false)
const saving = ref(false)
const uploading = ref(false)
const logoInput = useTemplateRef<HTMLInputElement>('logoInput')

function fill() {
  if (!settings.value) return
  Object.assign(form, {
    name: settings.value.name,
    legalName: settings.value.legalName ?? '',
    industry: settings.value.industry ?? '',
    phone: settings.value.phone ?? '',
    email: settings.value.email ?? '',
    timezone: settings.value.timezone
  })
}

onMounted(async () => {
  await load(true)
  fill()
})

async function onSave() {
  saving.value = true
  try {
    const patch: Record<string, unknown> = { ...form }
    if (editingNpwp.value) patch.npwp = npwpInput.value
    await save(patch)
    editingNpwp.value = false
    npwpInput.value = ''
    fill()
    toast.success('Pengaturan perusahaan disimpan')
  } catch (error) {
    toast.error(error)
  } finally {
    saving.value = false
  }
}

async function onLogoSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    await uploadImage('/api/app/uploads/company-logo', file, UPLOAD_PURPOSES.company_logo.clientResizePx)
    await load(true)
    await useTenantAuth().fetchProfile()
    toast.success('Logo diperbarui')
  } catch (error) {
    toast.error(error)
  } finally {
    uploading.value = false
    if (logoInput.value) logoInput.value.value = ''
  }
}

async function removeLogo() {
  try {
    await save({ logoUrl: null })
    toast.success('Logo dihapus')
  } catch (error) {
    toast.error(error)
  }
}
</script>

<template>
  <PagePanel title="Pengaturan">
    <SettingsNav />

    <USkeleton
      v-if="status === 'loading' && !settings"
      class="h-96 w-full max-w-2xl"
    />
    <UAlert
      v-else-if="status === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />

    <form
      v-else-if="settings"
      class="max-w-2xl space-y-6"
      @submit.prevent="onSave"
    >
      <div class="flex items-center gap-4">
        <UAvatar
          :src="settings.logoUrl ?? undefined"
          :alt="settings.name"
          size="3xl"
          class="rounded-lg"
        />
        <div class="space-y-1">
          <div class="flex gap-2">
            <UButton
              label="Unggah logo"
              icon="i-lucide-upload"
              size="sm"
              variant="outline"
              :loading="uploading"
              @click="logoInput?.click()"
            />
            <UButton
              v-if="settings.logoUrl"
              label="Hapus"
              size="sm"
              variant="ghost"
              color="neutral"
              @click="removeLogo"
            />
          </div>
          <p class="text-xs text-muted">
            JPG, PNG, WebP, atau GIF. Maks 512 KB.
          </p>
        </div>
        <input
          ref="logoInput"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          class="hidden"
          @change="onLogoSelected"
        >
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          label="Nama perusahaan"
          class="sm:col-span-2"
        >
          <UInput
            v-model="form.name"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Nama badan hukum"
          class="sm:col-span-2"
        >
          <UInput
            v-model="form.legalName"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Bidang usaha">
          <UInput
            v-model="form.industry"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Zona waktu tampilan"
          help="Zona tiap kantor diatur di menu Kantor."
        >
          <USelect
            v-model="form.timezone"
            :items="TIMEZONE_OPTIONS"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Telepon perusahaan">
          <UInput
            v-model="form.phone"
            type="tel"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Email perusahaan">
          <UInput
            v-model="form.email"
            type="email"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField
        label="NPWP perusahaan"
        help="Disimpan terenkripsi dan selalu ditampilkan tersamar."
      >
        <div
          v-if="!editingNpwp"
          class="flex items-center gap-3"
        >
          <span class="tabular font-mono text-sm">{{ settings.npwpMasked ?? 'Belum diisi' }}</span>
          <UButton
            :label="settings.npwpMasked ? 'Ganti' : 'Isi NPWP'"
            size="xs"
            variant="outline"
            @click="editingNpwp = true"
          />
        </div>
        <div
          v-else
          class="flex gap-2"
        >
          <UInput
            v-model="npwpInput"
            inputmode="numeric"
            placeholder="15 atau 16 digit (kosongkan untuk menghapus)"
            class="flex-1"
          />
          <UButton
            label="Batal"
            size="sm"
            variant="ghost"
            color="neutral"
            @click="editingNpwp = false; npwpInput = ''"
          />
        </div>
      </UFormField>

      <UButton
        type="submit"
        label="Simpan"
        :loading="saving"
      />
    </form>
  </PagePanel>
</template>
