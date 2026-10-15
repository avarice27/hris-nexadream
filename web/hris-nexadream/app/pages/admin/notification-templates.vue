<script setup lang="ts">
import { NOTIFICATION_LEVELS, NOTIFICATION_LEVEL_META, renderTemplateString, sampleVariables, type NotificationLevel, type TemplateVariable } from '#shared/utils/templates'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Templat notifikasi' })

interface NotificationTemplateRow {
  id: string
  key: string
  name: string
  title: string
  body: string
  actionLabel: string | null
  actionUrl: string | null
  icon: string | null
  level: NotificationLevel
  variables: TemplateVariable[]
  isActive: boolean
}

const auth = usePlatformAuth()
const toast = useToast()
const canWrite = computed(() => auth.hasPermission('notification-templates.write'))

const rows = ref<NotificationTemplateRow[]>([])
const status = ref<'loading' | 'error' | 'success'>('loading')
const errorMessage = ref('')

async function load() {
  status.value = 'loading'
  try {
    rows.value = (await apiFetch<{ items: NotificationTemplateRow[] }>('/api/admin/notification-templates')).items
    status.value = 'success'
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
    status.value = 'error'
  }
}
onMounted(load)

const levelItems = NOTIFICATION_LEVELS.map(level => ({ label: NOTIFICATION_LEVEL_META[level].label, value: level }))

const editing = ref<NotificationTemplateRow | null>(null)
const form = reactive({ title: '', body: '', actionLabel: '', actionUrl: '', icon: '', level: 'info' as NotificationLevel, isActive: true })
const saving = ref(false)
const formError = ref('')

function openEditor(row: NotificationTemplateRow) {
  editing.value = row
  Object.assign(form, {
    title: row.title, body: row.body, actionLabel: row.actionLabel ?? '', actionUrl: row.actionUrl ?? '',
    icon: row.icon ?? '', level: row.level, isActive: row.isActive
  })
  formError.value = ''
}

// Kurung kurawal disusun di script: literal {{ }} di template Vue merusak parser.
function tokenLabel(variable: TemplateVariable) {
  return `${'{'.repeat(2)}${variable.token}${'}'.repeat(2)} · ${variable.label}`
}

const previewVars = computed(() => editing.value ? { appName: 'HRIS Nexadream', ...sampleVariables(editing.value.variables) } : {})
const previewTitle = computed(() => renderTemplateString(form.title, previewVars.value))
const previewBody = computed(() => renderTemplateString(form.body, previewVars.value))

async function save() {
  if (!editing.value) return
  saving.value = true
  formError.value = ''
  try {
    await apiFetch(`/api/admin/notification-templates/${editing.value.id}`, { method: 'PATCH', body: { ...form } })
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
  <PagePanel title="Templat notifikasi">
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
          v-for="row in rows"
          :key="row.id"
        >
          <button
            type="button"
            class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
            @click="openEditor(row)"
          >
            <UIcon
              :name="row.icon || NOTIFICATION_LEVEL_META[row.level]?.icon"
              class="size-5 shrink-0"
              :class="NOTIFICATION_LEVEL_META[row.level]?.textClass"
            />
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium">{{ row.name }}</span>
              <span class="block truncate text-xs text-muted">{{ row.title }}</span>
            </span>
            <code class="hidden text-xs text-dimmed sm:block">{{ row.key }}</code>
            <UBadge
              :label="row.isActive ? 'Aktif' : 'Bawaan'"
              :color="row.isActive ? 'success' : 'neutral'"
              variant="subtle"
            />
          </button>
        </li>
      </ul>
    </UCard>

    <USlideover
      v-model:open="slideoverOpen"
      :title="editing?.name"
    >
      <template #body>
        <form
          v-if="editing"
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
            label="Judul"
            name="title"
          >
            <UInput
              v-model="form.title"
              :disabled="!canWrite"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Isi"
            name="body"
          >
            <UTextarea
              v-model="form.body"
              :rows="3"
              autoresize
              :disabled="!canWrite"
              class="w-full"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Label tombol"
              name="actionLabel"
            >
              <UInput
                v-model="form.actionLabel"
                :disabled="!canWrite"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Tautan"
              name="actionUrl"
              help="Diawali /, mis. /app/billing"
            >
              <UInput
                v-model="form.actionUrl"
                :disabled="!canWrite"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Ikon"
              name="icon"
              help="Nama ikon Lucide, mis. i-lucide-bell"
            >
              <UInput
                v-model="form.icon"
                :disabled="!canWrite"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Tingkat"
              name="level"
            >
              <USelect
                v-model="form.level"
                :items="levelItems"
                :disabled="!canWrite"
                class="w-full"
              />
            </UFormField>
          </div>
          <div v-if="editing.variables.length">
            <p class="mb-1 text-xs font-medium text-muted">
              Variabel tersedia
            </p>
            <p class="flex flex-wrap gap-1.5">
              <UBadge
                v-for="variable in editing.variables"
                :key="variable.token"
                :label="tokenLabel(variable)"
                variant="soft"
                color="neutral"
              />
            </p>
          </div>
          <USwitch
            v-model="form.isActive"
            label="Gunakan salinan ini"
            description="Bila nonaktif, salinan bawaan dari kode yang dipakai."
            :disabled="!canWrite"
          />

          <div class="rounded-md border border-default p-3">
            <p class="mb-2 text-xs font-medium text-muted">
              Pratinjau
            </p>
            <div class="flex gap-3">
              <UIcon
                :name="form.icon || NOTIFICATION_LEVEL_META[form.level]?.icon"
                class="mt-0.5 size-5 shrink-0"
                :class="NOTIFICATION_LEVEL_META[form.level]?.textClass"
              />
              <div>
                <p class="text-sm font-medium">
                  {{ previewTitle }}
                </p>
                <p class="text-sm text-muted">
                  {{ previewBody }}
                </p>
              </div>
            </div>
          </div>

          <UButton
            v-if="canWrite"
            type="submit"
            label="Simpan templat"
            :loading="saving"
          />
        </form>
      </template>
    </USlideover>
  </PagePanel>
</template>
