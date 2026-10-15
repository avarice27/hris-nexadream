<script setup lang="ts">
import { DOCUMENT_CATEGORY_LABELS, type DocumentCategory } from '#shared/utils/hr'

// Dokumen saya + dokumen perusahaan (SOP, peraturan). Dibuka lewat tautan sementara (≤ 5 menit).
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Dokumen' })

interface Doc { id: string, title: string, categoryLabel: string, expiresAt: string | null, createdAt: string, employee: { id: string } | null, size: number | null, fileName: string | null }
const toast = useApiToast()
const data = ref<{ items: Doc[], featureAvailable: boolean, selfCategories: DocumentCategory[] } | null>(null)
const errorMessage = ref('')
async function load() {
  try {
    data.value = await apiFetch('/api/app/me/documents')
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)
const categoryOptions = computed(() => (data.value?.selfCategories ?? []).map(c => ({ label: DOCUMENT_CATEGORY_LABELS[c], value: c })))
const mine = computed(() => data.value?.items.filter(d => d.employee) ?? [])
const company = computed(() => data.value?.items.filter(d => !d.employee) ?? [])

const open = ref(false)
const saving = ref(false)
const formError = ref('')
const form = reactive({ title: '', category: 'certificate' as DocumentCategory, expiresAt: '', file: null as File | null })
function openUpload() {
  if (data.value && !data.value.featureAvailable) return toast.error(null, 'Brankas dokumen belum aktif di paket perusahaan Anda.')
  Object.assign(form, { title: '', category: 'certificate', expiresAt: '', file: null })
  formError.value = ''
  open.value = true
}
async function upload() {
  if (!form.file) {
    formError.value = 'Pilih file untuk diunggah.'
    return
  }
  saving.value = true
  try {
    await uploadFileToApi('/api/app/me/documents', form.file, { title: form.title, category: form.category, ...(form.expiresAt ? { expiresAt: form.expiresAt } : {}) })
    open.value = false
    toast.success('Dokumen diunggah')
    await load()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold text-highlighted">
        Dokumen
      </h1>
      <UButton
        label="Unggah dokumen"
        icon="i-lucide-upload"
        @click="openUpload"
      />
    </div>
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!data"
      class="h-40 w-full"
    />
    <template v-else>
      <div
        v-for="group in [{ title: 'Dokumen saya', items: mine }, { title: 'Dokumen perusahaan', items: company }]"
        :key="group.title"
      >
        <h2 class="mb-2 font-semibold">
          {{ group.title }}
        </h2>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <p
            v-if="!group.items.length"
            class="p-6 text-center text-sm text-muted"
          >
            Belum ada dokumen.
          </p>
          <ul class="divide-y divide-default">
            <li
              v-for="d in group.items"
              :key="d.id"
              class="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <UIcon
                name="i-lucide-file-lock-2"
                class="size-5 text-muted"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">
                  {{ d.title }}
                </p>
                <p class="text-xs text-muted">
                  {{ d.categoryLabel }} · {{ formatDateId(d.createdAt) }}<span v-if="d.expiresAt"> · berlaku s.d. {{ formatDateShort(d.expiresAt) }}</span>
                </p>
              </div>
              <UButton
                label="Buka"
                icon="i-lucide-external-link"
                size="xs"
                variant="outline"
                @click="openSignedFile(`/api/app/me/documents/${d.id}/url`).catch(toast.error)"
              />
            </li>
          </ul>
        </UCard>
      </div>
    </template>

    <UModal
      v-model:open="open"
      title="Unggah dokumen"
      description="Dokumen tersimpan privat dan hanya terlihat oleh Anda dan Admin HR."
    >
      <template #body>
        <form
          id="doc-form"
          class="space-y-4"
          @submit.prevent="upload"
        >
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />
          <UFormField
            label="Judul"
            required
          >
            <UInput
              v-model="form.title"
              class="w-full"
              placeholder="Mis. Sertifikat K3"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Kategori">
              <USelect
                v-model="form.category"
                :items="categoryOptions"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Berlaku sampai">
              <UInput
                v-model="form.expiresAt"
                type="date"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField
            label="File (PDF/JPG/PNG, maks. 10 MB)"
            required
          >
            <input
              type="file"
              accept="application/pdf,image/*"
              class="text-sm"
              @change="(e) => (form.file = (e.target as HTMLInputElement).files?.[0] ?? null)"
            >
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Batal"
            variant="ghost"
            color="neutral"
            @click="open = false"
          />
          <UButton
            type="submit"
            form="doc-form"
            label="Unggah"
            :loading="saving"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
