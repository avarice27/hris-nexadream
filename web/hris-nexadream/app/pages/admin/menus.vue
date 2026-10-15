<script setup lang="ts">
// Editor sidebar /admin: pohon hingga 3 tingkat. Urutan diubah dengan tombol naik/turun
// (aksesibel lewat keyboard) dan disimpan dalam satu transaksi.
definePageMeta({ layout: 'admin' })
useHead({ title: 'Menu' })

interface MenuRow { id: string, parentId: string | null, label: string, slug: string, path: string | null, icon: string | null, permissionKey: string | null, order: number, isActive: boolean }
interface FlatNode extends MenuRow { depth: number, siblings: MenuRow[] }

const auth = usePlatformAuth()
const toast = useToast()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('menus.write'))
const rows = ref<MenuRow[]>([])
const permissionKeys = ref<string[]>([])
const errorMessage = ref('')
const loaded = ref(false)
async function load() {
  try {
    const response = await apiFetch<{ items: MenuRow[], permissionKeys: string[] }>('/api/admin/menus')
    rows.value = response.items
    permissionKeys.value = response.permissionKeys
    loaded.value = true
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)
const notify = (title: string, ok = true) => toast.add({ title, color: ok ? 'success' : 'error', icon: ok ? 'i-lucide-check' : 'i-lucide-circle-alert' })

const childrenOf = (parentId: string | null) => rows.value.filter(r => r.parentId === parentId).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
const flat = computed<FlatNode[]>(() => {
  const out: FlatNode[] = []
  const walk = (parentId: string | null, depth: number) => {
    const siblings = childrenOf(parentId)
    for (const row of siblings) {
      out.push({ ...row, depth, siblings })
      walk(row.id, depth + 1)
    }
  }
  walk(null, 1)
  return out
})

async function move(node: FlatNode, delta: -1 | 1) {
  const list = [...node.siblings]
  const index = list.findIndex(r => r.id === node.id)
  const target = index + delta
  if (target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target]!, list[index]!]
  try {
    await apiFetch('/api/admin/menus/reorder', { method: 'POST', body: { items: list.map((r, i) => ({ id: r.id, order: i, parentId: r.parentId })) } })
    await load()
  } catch (error) {
    notify(extractErrorMessage(error), false)
  }
}

// Form
const editing = ref<MenuRow | null>(null)
const isNew = ref(false)
const NONE = '__none__'
const form = reactive({ parentId: NONE, label: '', slug: '', path: '', icon: '', permissionKey: NONE, isActive: true })
const formError = ref('')
const open = computed({
  get: () => !!editing.value,
  set: (v: boolean) => {
    if (!v) editing.value = null
  }
})
const parentItems = computed(() => [{ label: '— Tingkat atas (bagian) —', value: NONE }, ...flat.value.filter(n => n.depth < 3 && n.id !== editing.value?.id).map(n => ({ label: `${'— '.repeat(n.depth - 1)}${n.label}`, value: n.id }))])
const permissionItems = computed(() => [{ label: 'Tanpa hak khusus', value: NONE }, ...permissionKeys.value.map(k => ({ label: k, value: k }))])

function openCreate() {
  isNew.value = true
  editing.value = { id: '', parentId: null, label: '', slug: '', path: null, icon: null, permissionKey: null, order: 999, isActive: true }
  Object.assign(form, { parentId: NONE, label: '', slug: '', path: '', icon: '', permissionKey: NONE, isActive: true })
  formError.value = ''
}
function openEdit(row: MenuRow) {
  isNew.value = false
  editing.value = row
  Object.assign(form, { parentId: row.parentId ?? NONE, label: row.label, slug: row.slug, path: row.path ?? '', icon: row.icon ?? '', permissionKey: row.permissionKey ?? NONE, isActive: row.isActive })
  formError.value = ''
}
async function save() {
  formError.value = ''
  const body = {
    parentId: form.parentId === NONE ? null : form.parentId,
    label: form.label, slug: form.slug, path: form.path || null, icon: form.icon || null,
    permissionKey: form.permissionKey === NONE ? null : form.permissionKey, isActive: form.isActive
  }
  try {
    if (isNew.value) await apiFetch('/api/admin/menus', { method: 'POST', body })
    else await apiFetch(`/api/admin/menus/${editing.value!.id}`, { method: 'PATCH', body })
    editing.value = null
    notify('Menu disimpan. Muat ulang halaman untuk melihat sidebar baru.')
    await load()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  }
}
async function remove(row: MenuRow) {
  if (!await confirm({ title: `Hapus menu ${row.label}?`, confirmLabel: 'Hapus', color: 'error' })) return
  try {
    await apiFetch(`/api/admin/menus/${row.id}`, { method: 'DELETE' })
    notify('Menu dihapus')
    await load()
  } catch (error) {
    notify(extractErrorMessage(error), false)
  }
}
</script>

<template>
  <PagePanel title="Menu">
    <template #actions>
      <UButton
        v-if="canWrite"
        label="Menu baru"
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
      v-else-if="!loaded"
      class="h-96 w-full"
    />
    <UCard
      v-else
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <ul class="divide-y divide-default">
        <li
          v-for="node in flat"
          :key="node.id"
          class="flex items-center gap-2 py-2 pe-3 text-sm"
          :style="{ paddingInlineStart: `${node.depth * 1.25}rem` }"
          :class="node.isActive ? '' : 'opacity-50'"
        >
          <UIcon
            :name="node.icon || (node.path ? 'i-lucide-dot' : 'i-lucide-folder')"
            class="size-4 text-muted"
          />
          <div class="min-w-0 flex-1">
            <p :class="node.path ? '' : 'font-semibold'">
              {{ node.label }}
            </p>
            <p class="truncate text-xs text-dimmed">
              {{ node.path ?? (node.depth === 1 ? 'bagian' : 'grup') }}<span v-if="node.permissionKey"> · {{ node.permissionKey }}</span>
            </p>
          </div>
          <template v-if="canWrite">
            <UButton
              icon="i-lucide-arrow-up"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Naikkan"
              :disabled="node.siblings[0]?.id === node.id"
              @click="move(node, -1)"
            />
            <UButton
              icon="i-lucide-arrow-down"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Turunkan"
              :disabled="node.siblings.at(-1)?.id === node.id"
              @click="move(node, 1)"
            />
            <UButton
              icon="i-lucide-pencil"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Ubah"
              @click="openEdit(node)"
            />
            <UButton
              icon="i-lucide-trash-2"
              size="xs"
              variant="ghost"
              color="error"
              aria-label="Hapus"
              @click="remove(node)"
            />
          </template>
        </li>
      </ul>
    </UCard>

    <USlideover
      v-model:open="open"
      :title="isNew ? 'Menu baru' : `Ubah ${editing?.label}`"
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
          <UFormField label="Induk">
            <USelect
              v-model="form.parentId"
              :items="parentItems"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Label">
            <UInput
              v-model="form.label"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Slug">
            <UInput
              v-model="form.slug"
              class="w-full font-mono"
            />
          </UFormField>
          <UFormField
            label="Path"
            help="Kosongkan untuk bagian/grup. Diawali /admin."
          >
            <UInput
              v-model="form.path"
              class="w-full font-mono"
              placeholder="/admin/…"
            />
          </UFormField>
          <UFormField
            label="Ikon"
            help="Nama ikon Lucide, mis. i-lucide-users"
          >
            <UInput
              v-model="form.icon"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Hak akses yang dibutuhkan">
            <USelect
              v-model="form.permissionKey"
              :items="permissionItems"
              class="w-full"
            />
          </UFormField>
          <USwitch
            v-model="form.isActive"
            label="Aktif"
          />
          <UButton
            type="submit"
            label="Simpan menu"
          />
        </form>
      </template>
    </USlideover>
  </PagePanel>
</template>
