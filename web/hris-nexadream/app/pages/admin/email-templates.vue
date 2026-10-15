<script setup lang="ts">
import type { TemplateVariable } from '#shared/utils/templates'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Templat email' })

interface EmailTemplateRow {
  id: string
  key: string
  name: string
  subject: string
  body: string
  description: string | null
  variables: TemplateVariable[]
  isActive: boolean
  updatedAt: string
}

const auth = usePlatformAuth()
const toast = useToast()
const canWrite = computed(() => auth.hasPermission('email-templates.write'))

const rows = ref<EmailTemplateRow[]>([])
const commonVariables = ref<TemplateVariable[]>([])
const status = ref<'loading' | 'error' | 'success'>('loading')
const errorMessage = ref('')
const search = ref('')

async function load() {
  status.value = 'loading'
  try {
    const response = await apiFetch<{ items: EmailTemplateRow[], commonVariables: TemplateVariable[] }>('/api/admin/email-templates')
    rows.value = response.items
    commonVariables.value = response.commonVariables
    status.value = 'success'
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
    status.value = 'error'
  }
}
onMounted(load)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? rows.value.filter(r => r.name.toLowerCase().includes(q) || r.key.includes(q)) : rows.value
})

// Editor
const editing = ref<EmailTemplateRow | null>(null)
const form = reactive({ subject: '', body: '', isActive: true })
const saving = ref(false)
const formError = ref('')
const preview = ref<{ subject: string, html: string, unknownTokens: string[] } | null>(null)
const bodyField = useTemplateRef<{ textareaRef?: HTMLTextAreaElement }>('bodyField')

function openEditor(row: EmailTemplateRow) {
  editing.value = row
  Object.assign(form, { subject: row.subject, body: row.body, isActive: row.isActive })
  formError.value = ''
  preview.value = null
  void refreshPreview()
}

let previewTimer: ReturnType<typeof setTimeout> | undefined
watch(() => [form.subject, form.body], () => {
  if (!editing.value) return
  clearTimeout(previewTimer)
  previewTimer = setTimeout(refreshPreview, 400)
})

async function refreshPreview() {
  if (!editing.value) return
  try {
    preview.value = await apiFetch('/api/admin/email-templates/preview', {
      method: 'POST',
      body: { subject: form.subject, body: form.body, variables: editing.value.variables }
    })
  } catch {
    // Pratinjau gagal tidak menghalangi pengeditan.
  }
}

function insertToken(token: string) {
  const text = `{{${token}}}`
  const el = bodyField.value?.textareaRef
  if (!el) {
    form.body += text
    return
  }
  const start = el.selectionStart ?? form.body.length
  const end = el.selectionEnd ?? start
  form.body = form.body.slice(0, start) + text + form.body.slice(end)
  nextTick(() => {
    el.focus()
    el.setSelectionRange(start + text.length, start + text.length)
  })
}

async function save() {
  if (!editing.value) return
  saving.value = true
  formError.value = ''
  try {
    await apiFetch(`/api/admin/email-templates/${editing.value.id}`, { method: 'PATCH', body: { ...form } })
    toast.add({ title: 'Templat disimpan', color: 'success', icon: 'i-lucide-check' })
    editing.value = null
    await load()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  } finally {
    saving.value = false
  }
}

const slideoverOpen = computed({
  get: () => !!editing.value,
  set: (v: boolean) => {
    if (!v) editing.value = null
  }
})
</script>

<template>
  <PagePanel title="Templat email">
    <div class="space-y-4">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Cari templat…"
        class="w-full sm:w-72"
        aria-label="Cari templat"
      />

      <div
        v-if="status === 'loading'"
        class="space-y-2"
      >
        <USkeleton
          v-for="i in 6"
          :key="i"
          class="h-14 w-full"
        />
      </div>
      <UAlert
        v-else-if="status === 'error'"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
      />
      <UCard
        v-else
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <ul class="divide-y divide-default">
          <li
            v-for="row in filtered"
            :key="row.id"
          >
            <button
              type="button"
              class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
              @click="openEditor(row)"
            >
              <UIcon
                name="i-lucide-mail"
                class="size-5 shrink-0 text-muted"
              />
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium">{{ row.name }}</span>
                <span class="block truncate text-xs text-muted">{{ row.subject }}</span>
              </span>
              <code class="hidden text-xs text-dimmed sm:block">{{ row.key }}</code>
              <UBadge
                :label="row.isActive ? 'Aktif' : 'Nonaktif'"
                :color="row.isActive ? 'success' : 'neutral'"
                variant="subtle"
              />
            </button>
          </li>
        </ul>
      </UCard>
    </div>

    <USlideover
      v-model:open="slideoverOpen"
      :title="editing?.name"
      :description="editing?.description ?? undefined"
      :ui="{ content: 'max-w-5xl' }"
    >
      <template #body>
        <div
          v-if="editing"
          class="grid gap-6 lg:grid-cols-2"
        >
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
            <UFormField
              label="Subjek"
              name="subject"
            >
              <UInput
                v-model="form.subject"
                :disabled="!canWrite"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Isi (HTML)"
              name="body"
              help="Hanya bagian isi. Logo, footer, dan gaya tombol (class=&quot;btn&quot;) ditambahkan otomatis."
            >
              <UTextarea
                ref="bodyField"
                v-model="form.body"
                :rows="12"
                autoresize
                :disabled="!canWrite"
                class="w-full font-mono text-xs"
              />
            </UFormField>
            <div>
              <p class="mb-2 text-xs font-medium text-muted">
                Variabel (klik untuk menyisipkan)
              </p>
              <div class="flex flex-wrap gap-1.5">
                <UButton
                  v-for="variable in [...editing.variables, ...commonVariables]"
                  :key="variable.token"
                  :label="variable.label"
                  size="xs"
                  variant="soft"
                  color="neutral"
                  :disabled="!canWrite"
                  @click="insertToken(variable.token)"
                />
              </div>
            </div>
            <USwitch
              v-model="form.isActive"
              label="Aktif"
              description="Bila nonaktif, email ini tidak dikirim sama sekali."
              :disabled="!canWrite"
            />
            <UButton
              v-if="canWrite"
              type="submit"
              label="Simpan templat"
              :loading="saving"
            />
          </form>

          <div class="space-y-2">
            <p class="text-xs font-medium text-muted">
              Pratinjau dengan data contoh
            </p>
            <UAlert
              v-if="preview?.unknownTokens.length"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              :title="`Variabel tidak dikenal akan kosong: ${preview.unknownTokens.join(', ')}`"
            />
            <div class="rounded-md border border-default">
              <p class="border-b border-default px-3 py-2 text-sm">
                <span class="text-muted">Subjek:</span> {{ preview?.subject }}
              </p>
              <iframe
                v-if="preview"
                :srcdoc="preview.html"
                title="Pratinjau email"
                sandbox=""
                class="h-[32rem] w-full rounded-b-md bg-white"
              />
            </div>
          </div>
        </div>
      </template>
    </USlideover>
  </PagePanel>
</template>
