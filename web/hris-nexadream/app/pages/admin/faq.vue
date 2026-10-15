<script setup lang="ts">
// FAQ untuk landing. Urutan, kategori, aktif.
definePageMeta({ layout: 'admin' })
useHead({ title: 'FAQ' })

interface FaqRow { id: string, question: string, answer: string, category: string, order: number, isActive: boolean }
const auth = usePlatformAuth()
const toast = useToast()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('faq.write'))
const rows = ref<FaqRow[] | null>(null)
const errorMessage = ref('')
async function load() {
  try {
    rows.value = (await apiFetch<{ items: FaqRow[] }>('/api/admin/faq')).items
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)

const editing = ref<FaqRow | null>(null)
const isNew = ref(false)
const form = reactive({ question: '', answer: '', category: 'umum', order: 0, isActive: true })
const formError = ref('')
const open = computed({
  get: () => !!editing.value,
  set: (v: boolean) => {
    if (!v) editing.value = null
  }
})
function openCreate() {
  isNew.value = true
  editing.value = { id: '', question: '', answer: '', category: 'umum', order: rows.value?.length ?? 0, isActive: true }
  Object.assign(form, { question: '', answer: '', category: 'umum', order: rows.value?.length ?? 0, isActive: true })
  formError.value = ''
}
function openEdit(row: FaqRow) {
  isNew.value = false
  editing.value = row
  Object.assign(form, row)
  formError.value = ''
}
async function save() {
  formError.value = ''
  const body = { question: form.question, answer: form.answer, category: form.category, order: form.order, isActive: form.isActive }
  try {
    if (isNew.value) await apiFetch('/api/admin/faq', { method: 'POST', body })
    else await apiFetch(`/api/admin/faq/${editing.value!.id}`, { method: 'PATCH', body })
    editing.value = null
    toast.add({ title: 'FAQ disimpan', color: 'success', icon: 'i-lucide-check' })
    await load()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  }
}
async function remove(row: FaqRow) {
  if (!await confirm({ title: 'Hapus pertanyaan ini?', description: row.question, confirmLabel: 'Hapus', color: 'error' })) return
  await apiFetch(`/api/admin/faq/${row.id}`, { method: 'DELETE' }).catch(error => toast.add({ title: extractErrorMessage(error), color: 'error' }))
  await load()
}
</script>

<template>
  <PagePanel title="FAQ">
    <template #actions>
      <UButton
        v-if="canWrite"
        label="Pertanyaan baru"
        icon="i-lucide-plus"
        @click="openCreate"
      />
    </template>
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!rows"
      class="h-64 w-full"
    />
    <p
      v-else-if="!rows.length"
      class="py-12 text-center text-sm text-muted"
    >
      Belum ada pertanyaan.
    </p>
    <UCard
      v-else
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <ul class="divide-y divide-default">
        <li
          v-for="row in rows"
          :key="row.id"
          class="flex flex-wrap items-start gap-3 px-4 py-3 text-sm"
          :class="row.isActive ? '' : 'opacity-60'"
        >
          <span class="tabular w-6 text-xs text-dimmed">{{ row.order }}</span>
          <div class="min-w-0 flex-1">
            <p class="font-medium">
              {{ row.question }}
            </p>
            <p class="line-clamp-2 text-muted">
              {{ row.answer }}
            </p>
          </div>
          <UBadge
            :label="row.category"
            size="sm"
            variant="subtle"
            color="neutral"
          />
          <template v-if="canWrite">
            <UButton
              icon="i-lucide-pencil"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Ubah"
              @click="openEdit(row)"
            />
            <UButton
              icon="i-lucide-trash-2"
              size="xs"
              variant="ghost"
              color="error"
              aria-label="Hapus"
              @click="remove(row)"
            />
          </template>
        </li>
      </ul>
    </UCard>

    <USlideover
      v-model:open="open"
      :title="isNew ? 'Pertanyaan baru' : 'Ubah pertanyaan'"
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="save"
        >
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="formError"
          />
          <UFormField label="Pertanyaan">
            <UInput
              v-model="form.question"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Jawaban">
            <UTextarea
              v-model="form.answer"
              :rows="6"
              autoresize
              class="w-full"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Kategori">
              <UInput
                v-model="form.category"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Urutan">
              <UInputNumber
                v-model="form.order"
                :min="0"
                class="w-full"
              />
            </UFormField>
          </div>
          <USwitch
            v-model="form.isActive"
            label="Tampilkan di situs"
          />
          <UButton
            type="submit"
            label="Simpan"
          />
        </form>
      </template>
    </USlideover>
  </PagePanel>
</template>
