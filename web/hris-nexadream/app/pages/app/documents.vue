<script setup lang="ts">
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, type DocumentCategory } from '#shared/utils/hr'

// Brankas dokumen: file privat, dibuka lewat tautan bertanda tangan ≤ 5 menit (setiap buka diaudit).
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Dokumen' })

interface Doc { id: string, title: string, category: DocumentCategory, categoryLabel: string, expiresAt: string | null, visibleToEmployee: boolean, createdAt: string, employee: { id: string, fullName: string, employeeNumber: string } | null, size: number | null, fileName: string | null }
const auth = useTenantAuth()
const toast = useApiToast()
const entitlements = useEntitlements()
const { confirm } = useConfirmDialog()
const scope = ref<string | undefined>('__all__')
const category = ref<string | undefined>('__all__')
const expiring = ref<string | undefined>(undefined)
const list = useServerList<Doc, { featureAvailable: boolean }>('/api/app/documents', { filters: { scope, category, expiring } })
const canWrite = computed(() => auth.hasAbility('documents.write'))

const open = ref(false)
const saving = ref(false)
const formError = ref('')
const form = reactive({ employeeId: undefined as string | null | undefined, category: 'contract' as DocumentCategory, title: '', expiresAt: '', visibleToEmployee: true, file: null as File | null })
function openUpload() {
  if (list.extra.value.featureAvailable === false) return entitlements.upgradeRequired('documentVault')
  Object.assign(form, { employeeId: undefined, category: 'contract', title: '', expiresAt: '', visibleToEmployee: true, file: null })
  formError.value = ''
  open.value = true
}
async function upload() {
  if (!form.file) {
    formError.value = 'Pilih file.'
    return
  }
  saving.value = true
  formError.value = ''
  try {
    await uploadFileToApi('/api/app/documents', form.file, {
      category: form.category, title: form.title, visibleToEmployee: String(form.visibleToEmployee),
      ...(form.employeeId && form.category !== 'company' ? { employeeId: form.employeeId } : {}),
      ...(form.expiresAt ? { expiresAt: form.expiresAt } : {})
    })
    open.value = false
    toast.success('Dokumen diunggah')
    await list.refresh()
  } catch (error) {
    if (!entitlements.handlePlanError(error)) formError.value = extractErrorMessage(error)
  } finally {
    saving.value = false
  }
}
async function remove(d: Doc) {
  if (!await confirm({ title: `Hapus ${d.title}?`, description: 'File dihapus permanen dari penyimpanan.', confirmLabel: 'Hapus', color: 'error' })) return
  try {
    await apiFetch(`/api/app/documents/${d.id}`, { method: 'DELETE' })
    toast.success('Dokumen dihapus')
    await list.refresh()
  } catch (error) {
    toast.error(error)
  }
}
const categoryOptions = DOCUMENT_CATEGORIES.map(c => ({ label: DOCUMENT_CATEGORY_LABELS[c], value: c }))
const categoryFilter = [{ label: 'Semua kategori', value: '__all__' }, ...categoryOptions]
const formatSize = (n: number | null) => (n == null ? '' : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`)
</script>

<template>
  <PagePanel title="Dokumen">
    <template #actions>
      <UButton
        v-if="canWrite"
        label="Unggah"
        icon="i-lucide-upload"
        @click="openUpload"
      />
    </template>
    <div class="space-y-4">
      <div class="flex flex-wrap gap-3">
        <UInput
          v-model="list.search.value"
          icon="i-lucide-search"
          placeholder="Cari judul atau karyawan…"
          class="w-full sm:w-64"
        />
        <USelect
          v-model="scope"
          :items="[{ label: 'Semua dokumen', value: '__all__' }, { label: 'Dokumen karyawan', value: 'employee' }, { label: 'Dokumen perusahaan', value: 'company' }]"
          class="w-48"
        />
        <USelect
          v-model="category"
          :items="categoryFilter"
          class="w-48"
        />
        <UButton
          :label="expiring ? 'Berakhir ≤ 30 hari' : 'Segera berakhir'"
          size="sm"
          :variant="expiring ? 'solid' : 'outline'"
          color="warning"
          @click="expiring = expiring ? undefined : 'true'"
        />
      </div>
      <ListState
        :status="list.status.value"
        :error="list.errorMessage.value"
        :empty="!list.items.value.length"
        empty-text="Belum ada dokumen."
        @retry="list.refresh"
      >
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="d in list.items.value"
              :key="d.id"
              class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
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
                  {{ d.categoryLabel }} ·
                  <NuxtLink
                    v-if="d.employee"
                    :to="`/app/employees/${d.employee.id}`"
                    class="hover:underline"
                  >{{ d.employee.fullName }}</NuxtLink>
                  <span v-else>Perusahaan</span>
                  · {{ formatSize(d.size) }} · {{ formatDateId(d.createdAt) }}
                  <span
                    v-if="d.expiresAt"
                    class="text-warning"
                  > · s.d. {{ formatDateShort(d.expiresAt) }}</span>
                  <span v-if="!d.visibleToEmployee"> · tersembunyi dari karyawan</span>
                </p>
              </div>
              <UButton
                label="Buka"
                icon="i-lucide-external-link"
                size="xs"
                variant="outline"
                @click="openSignedFile(`/api/app/documents/${d.id}/url`).catch(toast.error)"
              />
              <UButton
                v-if="canWrite"
                icon="i-lucide-trash-2"
                size="xs"
                variant="ghost"
                color="error"
                aria-label="Hapus"
                @click="remove(d)"
              />
            </li>
          </ul>
        </UCard>
      </ListState>
      <div
        v-if="list.meta.value.pageCount > 1"
        class="flex justify-center"
      >
        <UPagination
          v-model:page="list.page.value"
          :total="list.meta.value.total"
          :items-per-page="list.meta.value.limit"
        />
      </div>
    </div>

    <UModal
      v-model:open="open"
      title="Unggah dokumen"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />
          <UFormField label="Kategori">
            <USelect
              v-model="form.category"
              :items="categoryOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="form.category !== 'company'"
            label="Karyawan"
            required
          >
            <EmployeePicker v-model="form.employeeId" />
          </UFormField>
          <UFormField
            label="Judul"
            required
          >
            <UInput
              v-model="form.title"
              class="w-full"
              placeholder="Mis. PKWT 2026"
            />
          </UFormField>
          <UFormField
            label="Berlaku sampai"
            hint="Pengingat 30 hari sebelumnya"
          >
            <UInput
              v-model="form.expiresAt"
              type="date"
              class="w-full"
            />
          </UFormField>
          <UCheckbox
            v-model="form.visibleToEmployee"
            :label="form.category === 'company' ? 'Terlihat oleh semua karyawan' : 'Terlihat oleh karyawan ybs.'"
          />
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
        </div>
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
            label="Unggah"
            :loading="saving"
            @click="upload"
          />
        </div>
      </template>
    </UModal>
  </PagePanel>
</template>
