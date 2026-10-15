<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import { SETTING_GROUPS, SETTING_GROUP_META, type SettingDef, type SettingGroup } from '#shared/utils/settings'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Pengaturan' })

interface SettingsResponse { catalog: SettingDef[], values: Record<string, string> }

const auth = usePlatformAuth()
const toast = useToast()
const canWrite = computed(() => auth.hasPermission('settings.write'))

const catalog = ref<SettingDef[]>([])
const values = reactive<Record<string, string>>({})
const status = ref<'loading' | 'error' | 'success'>('loading')
const errorMessage = ref('')
const savingGroup = ref<SettingGroup | null>(null)
const activeTab = ref<SettingGroup>('company')

async function load() {
  status.value = 'loading'
  try {
    const response = await apiFetch<SettingsResponse>('/api/admin/settings')
    catalog.value = response.catalog
    Object.assign(values, response.values)
    status.value = 'success'
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
    status.value = 'error'
  }
}
onMounted(load)

const tabs = computed<TabsItem[]>(() => SETTING_GROUPS.map(group => ({
  label: SETTING_GROUP_META[group].label,
  icon: SETTING_GROUP_META[group].icon,
  value: group
})))

function defsFor(group: SettingGroup) {
  return catalog.value.filter(def => def.group === group)
}

async function save(group: SettingGroup) {
  savingGroup.value = group
  try {
    const groupValues = Object.fromEntries(defsFor(group).map(def => [def.key, values[def.key] ?? '']))
    await apiFetch('/api/admin/settings', { method: 'PATCH', body: { values: groupValues } })
    toast.add({ title: 'Pengaturan disimpan', color: 'success', icon: 'i-lucide-check' })
    await load()
  } catch (error) {
    toast.add({ title: extractErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    savingGroup.value = null
  }
}

// Email uji (grup SMTP)
const testTo = ref(auth.profile.value?.email ?? '')
const testing = ref(false)
async function sendTest() {
  testing.value = true
  try {
    await apiFetch('/api/admin/settings/test-email', { method: 'POST', body: { to: testTo.value } })
    toast.add({ title: `Email uji dikirim ke ${testTo.value}`, color: 'success', icon: 'i-lucide-mail-check' })
  } catch (error) {
    toast.add({ title: extractErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <PagePanel title="Pengaturan">
    <div
      v-if="status === 'loading'"
      class="space-y-3"
    >
      <USkeleton
        v-for="i in 6"
        :key="i"
        class="h-12 w-full max-w-2xl"
      />
    </div>
    <UAlert
      v-else-if="status === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    >
      <template #actions>
        <UButton
          label="Coba lagi"
          size="xs"
          @click="load"
        />
      </template>
    </UAlert>

    <UTabs
      v-else
      v-model="activeTab"
      :items="tabs"
      variant="link"
      class="w-full"
      :ui="{ list: 'overflow-x-auto', trigger: 'flex-none', label: 'whitespace-nowrap overflow-visible' }"
    >
      <template #content="{ item }">
        <form
          class="max-w-2xl space-y-5 pt-4"
          @submit.prevent="save(item.value as SettingGroup)"
        >
          <p class="text-sm text-muted">
            {{ SETTING_GROUP_META[item.value as SettingGroup].description }}
          </p>

          <UFormField
            v-for="def in defsFor(item.value as SettingGroup)"
            :key="def.key"
            :label="def.label"
            :help="def.hint"
            :name="def.key"
          >
            <USwitch
              v-if="def.type === 'boolean'"
              :model-value="values[def.key] === 'true'"
              :disabled="!canWrite"
              @update:model-value="(v: boolean) => (values[def.key] = v ? 'true' : 'false')"
            />
            <USelect
              v-else-if="def.type === 'select'"
              v-model="values[def.key]"
              :items="def.options ?? []"
              :disabled="!canWrite"
              class="w-full"
            />
            <UTextarea
              v-else-if="def.type === 'text' || def.type === 'json'"
              v-model="values[def.key]"
              :rows="def.type === 'json' ? 8 : 3"
              :disabled="!canWrite"
              autoresize
              class="w-full"
              :class="def.type === 'json' ? 'font-mono text-xs' : ''"
            />
            <PasswordInput
              v-else-if="def.type === 'secret'"
              v-model="values[def.key]"
              autocomplete="new-password"
            />
            <UInput
              v-else
              v-model="values[def.key]"
              :type="def.type === 'number' ? 'number' : 'text'"
              :disabled="!canWrite"
              class="w-full"
            />
          </UFormField>

          <UButton
            v-if="canWrite"
            type="submit"
            label="Simpan"
            :loading="savingGroup === item.value"
          />

          <UCard
            v-if="item.value === 'smtp' && canWrite"
            class="mt-6"
          >
            <p class="mb-3 text-sm font-medium">
              Kirim email uji
            </p>
            <div class="flex flex-col gap-2 sm:flex-row">
              <UInput
                v-model="testTo"
                type="email"
                placeholder="nama@nexadream.id"
                class="flex-1"
                aria-label="Penerima email uji"
              />
              <UButton
                label="Kirim email uji"
                icon="i-lucide-send"
                variant="outline"
                :loading="testing"
                :disabled="!testTo"
                @click="sendTest"
              />
            </div>
            <p class="mt-2 text-xs text-muted">
              Simpan pengaturan SMTP terlebih dahulu sebelum mengirim email uji.
            </p>
          </UCard>
        </form>
      </template>
    </UTabs>
  </PagePanel>
</template>
