<script setup lang="ts">
// API key perusahaan (pemilik saja; fitur paket apiAccess). Plaintext hanya tampil sekali.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'API key' })

interface Key { id: string, name: string, keyPrefix: string, scopes: string[], lastUsedAt: string | null, isActive: boolean, revokedAt: string | null, createdAt: string }
const toast = useApiToast()
const entitlements = useEntitlements()
const { confirm } = useConfirmDialog()
const data = ref<{ items: Key[], featureAvailable: boolean, enabled: boolean } | null>(null)
async function load() {
  try {
    data.value = await apiFetch('/api/app/api-keys')
  } catch (error) {
    toast.error(error)
  }
}
onMounted(load)

const open = ref(false)
const form = reactive({ name: '', write: false, sensitive: false })
const created = ref<string | null>(null)
const formError = ref('')
function openCreate() {
  if (data.value && !data.value.featureAvailable) return entitlements.upgradeRequired('apiAccess')
  Object.assign(form, { name: '', write: false, sensitive: false })
  created.value = null
  formError.value = ''
  open.value = true
}
async function create() {
  formError.value = ''
  try {
    const res = await apiFetch<{ key: string }>('/api/app/api-keys', { method: 'POST', body: { name: form.name, scopes: ['read', ...(form.write ? ['write'] : []), ...(form.sensitive ? ['sensitive'] : [])] } })
    created.value = res.key
    await load()
  } catch (error) {
    if (!entitlements.handlePlanError(error)) formError.value = extractErrorMessage(error)
  }
}
async function copy() {
  if (!created.value) return
  await navigator.clipboard.writeText(created.value)
  toast.success('Disalin ke clipboard')
}
async function revoke(k: Key) {
  if (!await confirm({ title: `Cabut ${k.name}?`, description: 'Integrasi yang memakai key ini akan langsung berhenti.', confirmLabel: 'Cabut key', color: 'error' })) return
  try {
    await apiFetch(`/api/app/api-keys/${k.id}`, { method: 'DELETE' })
    toast.success('Key dicabut')
    await load()
  } catch (error) {
    toast.error(error)
  }
}
</script>

<template>
  <PagePanel title="Pengaturan">
    <SettingsNav />
    <div class="max-w-3xl space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">
          Hubungkan sistem lain lewat <NuxtLink
            to="/docs/api"
            target="_blank"
            class="text-primary underline"
          >REST API</NuxtLink>. Key bertindak atas nama perusahaan; setiap aksinya tercatat sebagai "API: nama key".
        </p>
        <UButton
          label="Buat key"
          icon="i-lucide-plus"
          :trailing-icon="data && !data.featureAvailable ? 'i-lucide-lock' : undefined"
          @click="openCreate"
        />
      </div>
      <UAlert
        v-if="data && !data.enabled"
        color="warning"
        variant="subtle"
        title="API key sedang dinonaktifkan sementara oleh Nexadream."
      />
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <p
          v-if="data && !data.items.length"
          class="p-6 text-center text-sm text-muted"
        >
          Belum ada API key.
        </p>
        <ul class="divide-y divide-default">
          <li
            v-for="k in data?.items ?? []"
            :key="k.id"
            class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
            :class="k.isActive ? '' : 'opacity-60'"
          >
            <div class="min-w-0 flex-1">
              <p class="font-medium">
                {{ k.name }}
              </p>
              <p class="text-xs text-muted">
                <code>{{ k.keyPrefix }}…</code> · {{ k.scopes.join(', ') }} · {{ k.lastUsedAt ? `dipakai ${formatRelativeId(k.lastUsedAt)}` : 'belum pernah dipakai' }}
              </p>
            </div>
            <UBadge
              v-if="!k.isActive"
              label="Dicabut"
              color="neutral"
              variant="subtle"
              size="sm"
            />
            <UButton
              v-else
              label="Cabut"
              size="xs"
              variant="ghost"
              color="error"
              @click="revoke(k)"
            />
          </li>
        </ul>
      </UCard>
    </div>

    <UModal
      v-model:open="open"
      :title="created ? 'Simpan key ini sekarang' : 'API key baru'"
      :dismissible="!created"
    >
      <template #body>
        <div
          v-if="created"
          class="space-y-3"
        >
          <UAlert
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Key hanya ditampilkan sekali. Simpan di tempat aman (mis. secret manager)."
          />
          <div class="flex gap-2">
            <code class="flex-1 overflow-x-auto rounded-md bg-elevated px-3 py-2 text-xs">{{ created }}</code>
            <UButton
              icon="i-lucide-copy"
              aria-label="Salin"
              @click="copy"
            />
          </div>
        </div>
        <div
          v-else
          class="space-y-4"
        >
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />
          <UFormField label="Nama integrasi">
            <UInput
              v-model="form.name"
              class="w-full"
              placeholder="Mis. ERP Accurate"
            />
          </UFormField>
          <UCheckbox
            model-value
            disabled
            label="read — membaca data"
          />
          <UCheckbox
            v-model="form.write"
            label="write — menambah & mengubah data"
          />
          <UCheckbox
            v-model="form.sensitive"
            label="sensitive — membuka data pribadi & gaji (NIK, rekening, payroll)"
            description="Hanya bila benar-benar diperlukan. Pembacaan tetap dicatat di log aktivitas."
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            v-if="created"
            label="Selesai"
            @click="open = false"
          />
          <template v-else>
            <UButton
              label="Batal"
              variant="ghost"
              color="neutral"
              @click="open = false"
            />
            <UButton
              label="Buat key"
              @click="create"
            />
          </template>
        </div>
      </template>
    </UModal>
  </PagePanel>
</template>
