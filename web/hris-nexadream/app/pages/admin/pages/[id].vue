<script setup lang="ts">
// Editor halaman CMS. /admin/pages/new = buat baru.
definePageMeta({ layout: 'admin' })

interface PageDetail { id: string, slug: string, title: string, content: string, excerpt: string | null, metaTitle: string | null, metaDescription: string | null, isPublished: boolean }

const route = useRoute()
const auth = usePlatformAuth()
const toast = useToast()
const { confirm } = useConfirmDialog()
const isNew = computed(() => route.params.id === 'new')
const canWrite = computed(() => auth.hasPermission('pages.write'))
const form = reactive({ slug: '', title: '', content: '', excerpt: '', metaTitle: '', metaDescription: '', isPublished: true })
const loaded = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const pageId = ref<string | null>(null)

useHead({ title: () => isNew.value ? 'Halaman baru' : (form.title || 'Halaman') })

onMounted(async () => {
  if (isNew.value) {
    loaded.value = true
    return
  }
  try {
    const page = await apiFetch<PageDetail>(`/api/admin/pages/${route.params.id}`)
    pageId.value = page.id
    Object.assign(form, { ...page, excerpt: page.excerpt ?? '', metaTitle: page.metaTitle ?? '', metaDescription: page.metaDescription ?? '' })
    loaded.value = true
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
})

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    const body = { ...form, excerpt: form.excerpt || null, metaTitle: form.metaTitle || null, metaDescription: form.metaDescription || null }
    if (isNew.value) {
      const created = await apiFetch<PageDetail>('/api/admin/pages', { method: 'POST', body })
      toast.add({ title: 'Halaman dibuat', color: 'success', icon: 'i-lucide-check' })
      await navigateTo(`/admin/pages/${created.id}`, { replace: true })
      return
    }
    const updated = await apiFetch<PageDetail>(`/api/admin/pages/${pageId.value}`, { method: 'PATCH', body })
    form.content = updated.content // tampilkan versi yang sudah dibersihkan server
    toast.add({ title: 'Halaman disimpan', color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!await confirm({ title: `Hapus halaman ${form.title}?`, confirmLabel: 'Hapus', color: 'error' })) return
  try {
    await apiFetch(`/api/admin/pages/${pageId.value}`, { method: 'DELETE' })
    await navigateTo('/admin/pages')
  } catch (error) {
    toast.add({ title: extractErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
</script>

<template>
  <PagePanel :title="isNew ? 'Halaman baru' : (form.title || 'Halaman')">
    <template #actions>
      <UButton
        v-if="!isNew && form.isPublished"
        :to="`/page/${form.slug}`"
        target="_blank"
        label="Lihat"
        icon="i-lucide-external-link"
        variant="ghost"
        color="neutral"
      />
      <UButton
        to="/admin/pages"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
        aria-label="Kembali"
      />
    </template>

    <USkeleton
      v-if="!loaded && !errorMessage"
      class="h-96 w-full"
    />
    <form
      v-else
      class="max-w-4xl space-y-5"
      @submit.prevent="save"
    >
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
      />
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          label="Judul"
          required
        >
          <UInput
            v-model="form.title"
            class="w-full"
            :disabled="!canWrite"
          />
        </UFormField>
        <UFormField
          label="Slug"
          help="Alamat publik: /page/slug"
        >
          <UInput
            v-model="form.slug"
            class="w-full font-mono"
            :disabled="!canWrite || ['privacy', 'terms'].includes(form.slug) && !isNew"
          />
        </UFormField>
      </div>
      <UFormField label="Isi">
        <LazyRichTextEditor v-model="form.content" />
      </UFormField>
      <UFormField label="Ringkasan">
        <UTextarea
          v-model="form.excerpt"
          :rows="2"
          class="w-full"
          :disabled="!canWrite"
        />
      </UFormField>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          label="Judul SEO"
          :hint="`${form.metaTitle.length}/70`"
        >
          <UInput
            v-model="form.metaTitle"
            class="w-full"
            :disabled="!canWrite"
          />
        </UFormField>
        <UFormField
          label="Deskripsi SEO"
          :hint="`${form.metaDescription.length}/170`"
        >
          <UInput
            v-model="form.metaDescription"
            class="w-full"
            :disabled="!canWrite"
          />
        </UFormField>
      </div>
      <USwitch
        v-model="form.isPublished"
        label="Terbitkan"
        description="Halaman draf tidak bisa dibuka publik."
        :disabled="!canWrite"
      />
      <div
        v-if="canWrite"
        class="flex gap-2"
      >
        <UButton
          type="submit"
          label="Simpan"
          :loading="saving"
        />
        <UButton
          v-if="!isNew && !['privacy', 'terms'].includes(form.slug)"
          label="Hapus"
          variant="ghost"
          color="error"
          @click="remove"
        />
      </div>
    </form>
  </PagePanel>
</template>
