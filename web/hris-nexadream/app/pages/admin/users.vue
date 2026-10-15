<script setup lang="ts">
import { formatDateId, formatRelativeId } from '#shared/utils/format'
import { ImpersonateDialog } from '#components'

// Staf back-office ("Management"): undang, ubah, nonaktifkan, masuk sebagai staf lain (superadmin).
definePageMeta({ layout: 'admin' })
useHead({ title: 'Staf' })

interface StaffRow {
  id: string
  name: string
  email: string
  phone: string | null
  avatarUrl: string | null
  isActive: boolean
  role: { id: string, name: string, slug: string, isSuperAdmin: boolean }
  lastLoginAt: string | null
}
type Extra = {
  invitations: Array<{ id: string, email: string, name: string | null, roleName: string, expiresAt: string, isExpired: boolean }>
  roles: Array<{ id: string, name: string, slug: string, isSuperAdmin: boolean }>
}

const auth = usePlatformAuth()
const toast = useToast()
const overlay = useOverlay()
const { confirm } = useConfirmDialog()
const { impersonateStaff } = useAdminImpersonation()
const list = useServerList<StaffRow, Extra>('/api/admin/users')
const canWrite = computed(() => auth.hasPermission('users.write'))
const isSuperAdmin = computed(() => !!auth.profile.value?.role?.isSuperAdmin)
const meId = computed(() => auth.profile.value?.id)
const notify = (title: string, ok = true) => toast.add({ title, color: ok ? 'success' : 'error', icon: ok ? 'i-lucide-check' : 'i-lucide-circle-alert' })

const roleItems = computed(() => (list.extra.value.roles ?? [])
  .filter(r => isSuperAdmin.value || !r.isSuperAdmin)
  .map(r => ({ label: r.name, value: r.id })))

// Undang
const inviteOpen = ref(false)
const invite = reactive({ email: '', name: '', roleId: '' })
const inviteError = ref('')
function openInvite() {
  Object.assign(invite, { email: '', name: '', roleId: roleItems.value.find(r => r.label === 'Support')?.value ?? roleItems.value[0]?.value ?? '' })
  inviteError.value = ''
  inviteOpen.value = true
}
async function sendInvite() {
  inviteError.value = ''
  try {
    await apiFetch('/api/admin/users', { method: 'POST', body: { ...invite, name: invite.name || undefined } })
    inviteOpen.value = false
    notify(`Undangan dikirim ke ${invite.email}`)
    await list.refresh()
  } catch (error) {
    inviteError.value = extractErrorMessage(error)
  }
}
async function revokeInvite(id: string) {
  try {
    await apiFetch(`/api/admin/users/invitations/${id}`, { method: 'DELETE' })
    notify('Undangan dibatalkan')
    await list.refresh()
  } catch (error) {
    notify(extractErrorMessage(error), false)
  }
}

// Ubah
const editing = ref<StaffRow | null>(null)
const form = reactive({ name: '', phone: '', roleId: '' })
const editError = ref('')
function openEdit(row: StaffRow) {
  editing.value = row
  Object.assign(form, { name: row.name, phone: row.phone ?? '', roleId: row.role.id })
  editError.value = ''
}
async function saveEdit() {
  if (!editing.value) return
  editError.value = ''
  try {
    await apiFetch(`/api/admin/users/${editing.value.id}`, { method: 'PATCH', body: form })
    editing.value = null
    notify('Staf diperbarui')
    await list.refresh()
  } catch (error) {
    editError.value = extractErrorMessage(error)
  }
}
const editOpen = computed({
  get: () => !!editing.value,
  set: (v: boolean) => {
    if (!v) editing.value = null
  }
})

async function setActive(row: StaffRow, isActive: boolean) {
  if (!isActive && !await confirm({ title: `Nonaktifkan ${row.name}?`, description: 'Ia tidak bisa masuk ke back-office lagi. Riwayatnya tetap tersimpan.', confirmLabel: 'Nonaktifkan', color: 'error' })) return
  try {
    await apiFetch(`/api/admin/users/${row.id}`, { method: 'PATCH', body: { isActive } })
    notify(isActive ? 'Staf diaktifkan' : 'Staf dinonaktifkan')
    await list.refresh()
  } catch (error) {
    notify(extractErrorMessage(error), false)
  }
}

const impersonateModal = overlay.create(ImpersonateDialog)
async function impersonate(row: StaffRow) {
  const reason = await impersonateModal.open({ title: `Masuk sebagai ${row.name}`, description: 'Anda akan melihat back-office dengan hak akses staf ini.' })
  if (!reason) return
  try {
    await impersonateStaff(row.id, reason)
  } catch (error) {
    notify(extractErrorMessage(error), false)
  }
}

function rowActions(row: StaffRow) {
  const items = []
  if (canWrite.value) items.push({ label: 'Ubah', icon: 'i-lucide-pencil', onSelect: () => openEdit(row) })
  if (canWrite.value && row.id !== meId.value) {
    items.push(row.isActive
      ? { label: 'Nonaktifkan', icon: 'i-lucide-user-x', onSelect: () => setActive(row, false) }
      : { label: 'Aktifkan', icon: 'i-lucide-user-check', onSelect: () => setActive(row, true) })
  }
  if (isSuperAdmin.value && !auth.impersonating.value && row.id !== meId.value && !row.role.isSuperAdmin && row.isActive) {
    items.push({ label: 'Masuk sebagai', icon: 'i-lucide-log-in', onSelect: () => impersonate(row) })
  }
  return [items]
}
</script>

<template>
  <PagePanel title="Staf">
    <template #actions>
      <UButton
        v-if="canWrite"
        label="Undang staf"
        icon="i-lucide-user-plus"
        @click="openInvite"
      />
    </template>
    <div class="space-y-4">
      <UInput
        v-model="list.search.value"
        icon="i-lucide-search"
        placeholder="Cari nama atau email…"
        class="w-full sm:w-72"
        aria-label="Cari staf"
      />
      <ListState
        :status="list.status.value"
        :error="list.errorMessage.value"
        :empty="!list.items.value.length"
        @retry="list.refresh"
      >
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="row in list.items.value"
              :key="row.id"
              class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
              :class="row.isActive ? '' : 'opacity-60'"
            >
              <UAvatar
                :src="row.avatarUrl ?? undefined"
                :alt="row.name"
              />
              <div class="min-w-0 flex-1">
                <p class="font-medium">
                  {{ row.name }} <span
                    v-if="row.id === meId"
                    class="text-xs text-muted"
                  >(Anda)</span>
                </p>
                <p class="truncate text-xs text-muted">
                  {{ row.email }} · {{ row.lastLoginAt ? `masuk ${formatRelativeId(row.lastLoginAt)}` : 'belum pernah masuk' }}
                </p>
              </div>
              <UBadge
                :label="row.role.name"
                :color="row.role.isSuperAdmin ? 'primary' : 'neutral'"
                variant="subtle"
              />
              <UBadge
                v-if="!row.isActive"
                label="Nonaktif"
                color="neutral"
                variant="outline"
              />
              <UDropdownMenu
                v-if="rowActions(row)[0]!.length"
                :items="rowActions(row)"
                :content="{ align: 'end' }"
              >
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  variant="ghost"
                  color="neutral"
                  aria-label="Aksi staf"
                />
              </UDropdownMenu>
            </li>
          </ul>
        </UCard>
      </ListState>

      <section
        v-if="list.extra.value.invitations?.length"
        class="space-y-2"
      >
        <h2 class="text-sm font-semibold">
          Undangan
        </h2>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="inv in list.extra.value.invitations"
              :key="inv.id"
              class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
            >
              <UIcon
                name="i-lucide-mail"
                class="size-5 text-muted"
              />
              <div class="min-w-0 flex-1">
                <p class="font-medium">
                  {{ inv.name || inv.email }}
                </p>
                <p
                  class="text-xs"
                  :class="inv.isExpired ? 'text-error' : 'text-muted'"
                >
                  {{ inv.email }} · {{ inv.roleName }} · {{ inv.isExpired ? 'kedaluwarsa' : `berlaku sampai ${formatDateId(inv.expiresAt, auth.displayTimezone.value)}` }}
                </p>
              </div>
              <UButton
                v-if="canWrite"
                label="Batalkan"
                size="xs"
                variant="ghost"
                color="error"
                @click="revokeInvite(inv.id)"
              />
            </li>
          </ul>
        </UCard>
      </section>
    </div>

    <USlideover
      v-model:open="inviteOpen"
      title="Undang staf"
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="sendInvite"
        >
          <UAlert
            v-if="inviteError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="inviteError"
          />
          <UFormField
            label="Email"
            required
          >
            <UInput
              v-model="invite.email"
              type="email"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Nama (opsional)">
            <UInput
              v-model="invite.name"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Peran"
            required
          >
            <USelect
              v-model="invite.roleId"
              :items="roleItems"
              class="w-full"
            />
          </UFormField>
          <p class="text-xs text-muted">
            Tautan undangan berlaku 7 hari. Staf menetapkan nama dan kata sandinya sendiri.
          </p>
          <UButton
            type="submit"
            label="Kirim undangan"
            icon="i-lucide-send"
          />
        </form>
      </template>
    </USlideover>

    <USlideover
      v-model:open="editOpen"
      :title="editing ? `Ubah ${editing.name}` : ''"
    >
      <template #body>
        <form
          v-if="editing"
          class="space-y-4"
          @submit.prevent="saveEdit"
        >
          <UAlert
            v-if="editError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="editError"
          />
          <UFormField label="Nama">
            <UInput
              v-model="form.name"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Telepon">
            <UInput
              v-model="form.phone"
              type="tel"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Peran"
            :help="editing.id === meId ? 'Anda tidak bisa mengubah peran sendiri.' : undefined"
          >
            <USelect
              v-model="form.roleId"
              :items="roleItems"
              :disabled="editing.id === meId"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            label="Simpan"
          />
        </form>
      </template>
    </USlideover>
  </PagePanel>
</template>
