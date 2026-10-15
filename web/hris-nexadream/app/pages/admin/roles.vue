<script setup lang="ts">
// Peran staf + checklist hak akses per grup (kolom per aksi).
definePageMeta({ layout: 'admin' })
useHead({ title: 'Peran' })

interface RoleRow { id: string, slug: string, name: string, description: string | null, isSuperAdmin: boolean, isSystem: boolean, userCount: number, permissions: string[] }
interface RolesResponse { items: RoleRow[], catalog: Array<{ key: string, group: string }>, groupLabels: Record<string, string> }

const auth = usePlatformAuth()
const toast = useToast()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('roles.write'))
const data = ref<RolesResponse | null>(null)
const errorMessage = ref('')
async function load() {
  try {
    data.value = await apiFetch<RolesResponse>('/api/admin/roles')
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)
const notify = (title: string, ok = true) => toast.add({ title, color: ok ? 'success' : 'error', icon: ok ? 'i-lucide-check' : 'i-lucide-circle-alert' })

const groups = computed(() => {
  const map = new Map<string, string[]>()
  for (const item of data.value?.catalog ?? []) map.set(item.group, [...(map.get(item.group) ?? []), item.key])
  return [...map.entries()].map(([group, keys]) => ({ group, label: data.value?.groupLabels[group] ?? group, keys }))
})
const actionLabel = (key: string) => ({ read: 'Lihat', write: 'Ubah', use: 'Gunakan', viewSensitive: 'Data sensitif' } as Record<string, string>)[key.split('.').pop()!] ?? key

const editing = ref<RoleRow | null>(null)
const isNew = ref(false)
const form = reactive({ slug: '', name: '', description: '', permissions: [] as string[] })
const formError = ref('')
const open = computed({
  get: () => !!editing.value,
  set: (v: boolean) => {
    if (!v) editing.value = null
  }
})

function openCreate() {
  isNew.value = true
  editing.value = { id: '', slug: '', name: '', description: null, isSuperAdmin: false, isSystem: false, userCount: 0, permissions: [] }
  Object.assign(form, { slug: '', name: '', description: '', permissions: ['dashboard.read'] })
  formError.value = ''
}
function openEdit(role: RoleRow) {
  isNew.value = false
  editing.value = role
  Object.assign(form, { slug: role.slug, name: role.name, description: role.description ?? '', permissions: [...role.permissions] })
  formError.value = ''
}
function toggle(key: string, checked: boolean) {
  form.permissions = checked ? [...new Set([...form.permissions, key])] : form.permissions.filter(k => k !== key)
}
async function save() {
  formError.value = ''
  try {
    const body = { ...form, description: form.description || null, ...(editing.value?.isSuperAdmin ? { permissions: undefined } : {}) }
    if (isNew.value) await apiFetch('/api/admin/roles', { method: 'POST', body })
    else await apiFetch(`/api/admin/roles/${editing.value!.id}`, { method: 'PATCH', body })
    editing.value = null
    notify('Peran disimpan')
    await load()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  }
}
async function remove(role: RoleRow) {
  if (!await confirm({ title: `Hapus peran ${role.name}?`, confirmLabel: 'Hapus', color: 'error' })) return
  try {
    await apiFetch(`/api/admin/roles/${role.id}`, { method: 'DELETE' })
    notify('Peran dihapus')
    await load()
  } catch (error) {
    notify(extractErrorMessage(error), false)
  }
}
</script>

<template>
  <PagePanel title="Peran">
    <template #actions>
      <UButton
        v-if="canWrite"
        label="Peran baru"
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
      v-else-if="!data"
      class="h-64 w-full"
    />
    <div
      v-else
      class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      <UCard
        v-for="role in data.items"
        :key="role.id"
      >
        <div class="space-y-2">
          <p class="flex flex-wrap items-center gap-2 font-semibold">
            {{ role.name }}
            <UBadge
              v-if="role.isSuperAdmin"
              label="Superadmin"
              size="sm"
              variant="subtle"
            />
            <UBadge
              v-else-if="role.isSystem"
              label="Sistem"
              size="sm"
              color="neutral"
              variant="subtle"
            />
          </p>
          <p class="text-sm text-muted">
            {{ role.description ?? '—' }}
          </p>
          <p class="text-xs text-muted">
            <code>{{ role.slug }}</code> · {{ role.userCount }} staf · {{ role.isSuperAdmin ? 'semua hak (kecuali data sensitif)' : `${role.permissions.length} hak akses` }}
          </p>
        </div>
        <template
          v-if="canWrite"
          #footer
        >
          <div class="flex gap-2">
            <UButton
              label="Ubah"
              size="sm"
              variant="outline"
              icon="i-lucide-pencil"
              @click="openEdit(role)"
            />
            <UButton
              v-if="!role.isSystem && role.userCount === 0"
              label="Hapus"
              size="sm"
              variant="ghost"
              color="error"
              @click="remove(role)"
            />
          </div>
        </template>
      </UCard>
    </div>

    <USlideover
      v-model:open="open"
      :title="isNew ? 'Peran baru' : `Ubah ${editing?.name}`"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <form
          v-if="editing"
          class="space-y-5"
          @submit.prevent="save"
        >
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="formError"
          />
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Nama">
              <UInput
                v-model="form.name"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Slug"
              :help="editing.isSystem ? 'Slug peran sistem tetap.' : undefined"
            >
              <UInput
                v-model="form.slug"
                :disabled="editing.isSystem"
                class="w-full font-mono"
              />
            </UFormField>
            <UFormField
              label="Deskripsi"
              class="sm:col-span-2"
            >
              <UInput
                v-model="form.description"
                class="w-full"
              />
            </UFormField>
          </div>
          <UAlert
            v-if="editing.isSuperAdmin"
            color="info"
            variant="subtle"
            icon="i-lucide-info"
            title="Superadmin memegang semua hak; daftarnya tidak bisa diubah."
          />
          <div
            v-else
            class="overflow-hidden rounded-md border border-default"
          >
            <table class="w-full text-sm">
              <tbody class="divide-y divide-default">
                <tr
                  v-for="g in groups"
                  :key="g.group"
                >
                  <td class="px-3 py-2 font-medium">
                    {{ g.label }}
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap justify-end gap-4">
                      <UCheckbox
                        v-for="key in g.keys"
                        :key="key"
                        :label="actionLabel(key)"
                        :model-value="form.permissions.includes(key)"
                        @update:model-value="(v: boolean | 'indeterminate') => toggle(key, v === true)"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-xs text-muted">
            "Data sensitif" pada Masuk sebagai membuka NIK, gaji, rekening, dan dokumen karyawan selama sesi dukungan — berikan hanya bila benar-benar perlu.
          </p>
          <UButton
            type="submit"
            label="Simpan peran"
          />
        </form>
      </template>
    </USlideover>
  </PagePanel>
</template>
