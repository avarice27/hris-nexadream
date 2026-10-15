<script setup lang="ts">
import { ASSIGNABLE_TENANT_ROLES, TENANT_ROLE_PRESETS, type TenantRoleSlug } from '#shared/utils/tenant-abilities'
import { formatLimit } from '#shared/utils/plans'
import { formatDateId, formatRelativeId } from '#shared/utils/format'
import { TENANT_ROLE_META } from '#shared/utils/status'

definePageMeta({ layout: 'tenant' })
useHead({ title: 'Tim & Akses' })

interface TeamMember {
  id: string
  role: TenantRoleSlug
  isActive: boolean
  isSelf: boolean
  branchIds: string[]
  user: { id: string, name: string, email: string, phone: string | null, avatarUrl: string | null, lastLoginAt: string | null }
}
interface TeamInvitation { id: string, email: string, name: string | null, role: TenantRoleSlug, branchIds: string[], expiresAt: string, isExpired: boolean }
interface TeamResponse {
  members: TeamMember[]
  invitations: TeamInvitation[]
  seats: { active: number, pending: number, used: number, limit: number }
  essLogins: number
  branchScopeAvailable: boolean
}

const auth = useTenantAuth()
const toast = useApiToast()
const { confirm } = useConfirmDialog()
const branch = useActiveBranch()

const data = ref<TeamResponse | null>(null)
const status = ref<'loading' | 'error' | 'success'>('loading')
const errorMessage = ref('')

async function load() {
  try {
    data.value = await apiFetch<TeamResponse>('/api/app/team')
    status.value = 'success'
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
    status.value = 'error'
  }
}
onMounted(async () => {
  await Promise.all([load(), branch.load().catch(() => {})])
})

const seatsFull = computed(() => !!data.value && data.value.seats.limit !== -1 && data.value.seats.used >= data.value.seats.limit)
const branchItems = computed(() => branch.activeBranches.value.map(b => ({ label: b.name, value: b.id })))
const branchName = (id: string) => branch.branches.value.find(b => b.id === id)?.name ?? 'Kantor'

// --- Undang ---
const inviteOpen = ref(false)
const inviting = ref(false)
const inviteError = ref('')
const invite = reactive({ email: '', name: '', role: 'hr_admin' as TenantRoleSlug, branchIds: [] as string[] })

function openInvite() {
  // Batas seat tercapai → tawarkan upgrade, jangan sekadar menonaktifkan tombol.
  if (seatsFull.value) {
    useEntitlements().limitReached('teamMembers')
    return
  }
  Object.assign(invite, { email: '', name: '', role: 'hr_admin', branchIds: [] })
  inviteError.value = ''
  inviteOpen.value = true
}

async function sendInvite() {
  inviting.value = true
  inviteError.value = ''
  try {
    await apiFetch('/api/app/team/invitations', { method: 'POST', body: { ...invite, name: invite.name || undefined } })
    inviteOpen.value = false
    toast.success('Undangan terkirim', `Tautan berlaku 7 hari untuk ${invite.email}.`)
    await load()
  } catch (error) {
    if (extractStatusCode(error) === 402) toast.error(error)
    else inviteError.value = extractErrorMessage(error)
  } finally {
    inviting.value = false
  }
}

async function revoke(invitation: TeamInvitation) {
  const ok = await confirm({ title: `Batalkan undangan ${invitation.email}?`, description: 'Tautan undangan tidak bisa dipakai lagi.', confirmLabel: 'Batalkan undangan', color: 'error' })
  if (!ok) return
  try {
    await apiFetch(`/api/app/team/invitations/${invitation.id}`, { method: 'DELETE' })
    toast.success('Undangan dibatalkan')
    await load()
  } catch (error) {
    toast.error(error)
  }
}

async function resend(invitation: TeamInvitation) {
  try {
    await apiFetch('/api/app/team/invitations', { method: 'POST', body: { email: invitation.email, name: invitation.name ?? undefined, role: invitation.role, branchIds: invitation.branchIds } })
    toast.success('Undangan dikirim ulang')
    await load()
  } catch (error) {
    toast.error(error)
  }
}

// --- Ubah anggota ---
const editing = ref<TeamMember | null>(null)
const memberForm = reactive({ role: 'hr_admin' as TenantRoleSlug, branchIds: [] as string[] })
const savingMember = ref(false)

function openEdit(member: TeamMember) {
  editing.value = member
  Object.assign(memberForm, { role: member.role, branchIds: [...member.branchIds] })
}

async function saveMember() {
  if (!editing.value) return
  savingMember.value = true
  try {
    await apiFetch(`/api/app/team/members/${editing.value.id}`, {
      method: 'PATCH',
      body: { role: memberForm.role, ...(data.value?.branchScopeAvailable ? { branchIds: memberForm.branchIds } : {}) }
    })
    editing.value = null
    toast.success('Akses anggota diperbarui')
    await load()
  } catch (error) {
    toast.error(error)
  } finally {
    savingMember.value = false
  }
}

async function setActive(member: TeamMember, isActive: boolean) {
  if (!isActive) {
    const ok = await confirm({
      title: `Nonaktifkan ${member.user.name}?`,
      description: 'Ia tidak bisa masuk lagi ke perusahaan ini. Riwayat aktivitasnya tetap tersimpan dan bisa diaktifkan kembali.',
      confirmLabel: 'Nonaktifkan',
      color: 'error'
    })
    if (!ok) return
  }
  try {
    await apiFetch(`/api/app/team/members/${member.id}`, { method: 'PATCH', body: { isActive } })
    toast.success(isActive ? 'Anggota diaktifkan' : 'Anggota dinonaktifkan')
    await load()
  } catch (error) {
    toast.error(error)
  }
}

function memberActions(member: TeamMember) {
  if (member.role === 'owner' || member.isSelf) return []
  return [[
    { label: 'Ubah peran & akses', icon: 'i-lucide-pencil', onSelect: () => openEdit(member) },
    member.isActive
      ? { label: 'Nonaktifkan', icon: 'i-lucide-user-x', color: 'error' as const, onSelect: () => setActive(member, false) }
      : { label: 'Aktifkan kembali', icon: 'i-lucide-user-check', onSelect: () => setActive(member, true) }
  ]]
}

const editOpen = computed({
  get: () => !!editing.value,
  set: (v: boolean) => {
    if (!v) editing.value = null
  }
})
</script>

<template>
  <PagePanel title="Tim & Akses">
    <template #actions>
      <UButton
        label="Undang anggota"
        icon="i-lucide-user-plus"
        @click="openInvite"
      />
    </template>

    <div
      v-if="status === 'loading'"
      class="space-y-2"
    >
      <USkeleton
        v-for="i in 4"
        :key="i"
        class="h-16 w-full"
      />
    </div>
    <UAlert
      v-else-if="status === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />

    <div
      v-else-if="data"
      class="space-y-6"
    >
      <UCard :ui="{ body: 'p-4 sm:p-4' }">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span><strong class="tabular">{{ data.seats.used }}</strong> / {{ formatLimit('teamMembers', data.seats.limit) }} seat tim terpakai</span>
          <span class="text-muted">{{ data.seats.pending }} undangan menunggu</span>
          <span class="text-muted">{{ data.essLogins }} karyawan memakai layanan mandiri (tidak memakai seat)</span>
          <ULink
            v-if="seatsFull"
            to="/app/billing"
            class="text-primary"
          >Tambah seat</ULink>
        </div>
      </UCard>

      <section class="space-y-2">
        <h2 class="text-sm font-semibold">
          Anggota
        </h2>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="member in data.members"
              :key="member.id"
              class="flex items-center gap-3 px-4 py-3"
              :class="member.isActive ? '' : 'opacity-60'"
            >
              <UAvatar
                :src="member.user.avatarUrl ?? undefined"
                :alt="member.user.name"
              />
              <div class="min-w-0 flex-1">
                <p class="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {{ member.user.name }}
                  <span
                    v-if="member.isSelf"
                    class="text-xs text-muted"
                  >(Anda)</span>
                  <UBadge
                    v-if="!member.isActive"
                    label="Nonaktif"
                    size="sm"
                    color="neutral"
                    variant="subtle"
                  />
                </p>
                <p class="truncate text-xs text-muted">
                  {{ member.user.email }}
                  <span v-if="member.branchIds.length"> · {{ member.branchIds.map(branchName).join(', ') }}</span>
                  <span v-else-if="member.role !== 'owner'"> · Semua kantor</span>
                </p>
              </div>
              <span class="hidden text-xs text-dimmed md:block">{{ member.user.lastLoginAt ? `Masuk ${formatRelativeId(member.user.lastLoginAt)}` : 'Belum pernah masuk' }}</span>
              <UBadge
                :label="TENANT_ROLE_META[member.role]?.label"
                :color="TENANT_ROLE_META[member.role]?.color"
                variant="subtle"
              />
              <UDropdownMenu
                v-if="memberActions(member).length"
                :items="memberActions(member)"
                :content="{ align: 'end' }"
              >
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  variant="ghost"
                  color="neutral"
                  aria-label="Aksi anggota"
                />
              </UDropdownMenu>
              <span
                v-else
                class="w-8"
              />
            </li>
          </ul>
        </UCard>
      </section>

      <section
        v-if="data.invitations.length"
        class="space-y-2"
      >
        <h2 class="text-sm font-semibold">
          Undangan
        </h2>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="invitation in data.invitations"
              :key="invitation.id"
              class="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <UIcon
                name="i-lucide-mail"
                class="size-5 text-muted"
              />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">
                  {{ invitation.name || invitation.email }}
                </p>
                <p
                  class="text-xs"
                  :class="invitation.isExpired ? 'text-error' : 'text-muted'"
                >
                  {{ invitation.email }} · {{ invitation.isExpired ? 'Kedaluwarsa' : `Berlaku sampai ${formatDateId(invitation.expiresAt, auth.displayTimezone.value)}` }}
                </p>
              </div>
              <UBadge
                :label="TENANT_ROLE_META[invitation.role]?.label"
                color="neutral"
                variant="subtle"
              />
              <UButton
                label="Kirim ulang"
                size="xs"
                variant="outline"
                @click="resend(invitation)"
              />
              <UButton
                label="Batalkan"
                size="xs"
                variant="ghost"
                color="error"
                @click="revoke(invitation)"
              />
            </li>
          </ul>
        </UCard>
      </section>

      <UAlert
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        title="Mengundang karyawan?"
        description="Akses layanan mandiri karyawan (absensi, cuti, slip gaji) diberikan dari data karyawan, bukan dari halaman ini, dan tidak memakai seat tim."
      />
    </div>

    <USlideover
      v-model:open="inviteOpen"
      title="Undang anggota tim"
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
          <fieldset class="space-y-2">
            <legend class="mb-1 text-sm font-medium">
              Peran
            </legend>
            <button
              v-for="role in ASSIGNABLE_TENANT_ROLES"
              :key="role"
              type="button"
              class="flex w-full gap-3 rounded-md border p-3 text-left transition-colors"
              :class="invite.role === role ? 'border-primary bg-primary/5' : 'border-default hover:bg-elevated'"
              :aria-pressed="invite.role === role"
              @click="invite.role = role"
            >
              <UIcon
                :name="TENANT_ROLE_PRESETS[role].icon"
                class="mt-0.5 size-5 text-primary"
              />
              <span>
                <span class="block text-sm font-medium">{{ TENANT_ROLE_PRESETS[role].label }}</span>
                <span class="block text-xs text-muted">{{ TENANT_ROLE_PRESETS[role].summary }}</span>
              </span>
            </button>
          </fieldset>
          <UFormField
            v-if="branchItems.length > 1"
            label="Batasi ke kantor"
            :help="data?.branchScopeAvailable ? 'Kosongkan untuk semua kantor.' : 'Pembatasan per kantor tersedia di paket Business.'"
          >
            <USelectMenu
              v-model="invite.branchIds"
              :items="branchItems"
              value-key="value"
              multiple
              placeholder="Semua kantor"
              :disabled="!data?.branchScopeAvailable"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            label="Kirim undangan"
            icon="i-lucide-send"
            :loading="inviting"
          />
        </form>
      </template>
    </USlideover>

    <USlideover
      v-model:open="editOpen"
      :title="editing ? `Akses ${editing.user.name}` : ''"
    >
      <template #body>
        <form
          v-if="editing"
          class="space-y-4"
          @submit.prevent="saveMember"
        >
          <fieldset class="space-y-2">
            <legend class="mb-1 text-sm font-medium">
              Peran
            </legend>
            <button
              v-for="role in ASSIGNABLE_TENANT_ROLES"
              :key="role"
              type="button"
              class="flex w-full gap-3 rounded-md border p-3 text-left transition-colors"
              :class="memberForm.role === role ? 'border-primary bg-primary/5' : 'border-default hover:bg-elevated'"
              :aria-pressed="memberForm.role === role"
              @click="memberForm.role = role"
            >
              <UIcon
                :name="TENANT_ROLE_PRESETS[role].icon"
                class="mt-0.5 size-5 text-primary"
              />
              <span>
                <span class="block text-sm font-medium">{{ TENANT_ROLE_PRESETS[role].label }}</span>
                <span class="block text-xs text-muted">{{ TENANT_ROLE_PRESETS[role].summary }}</span>
              </span>
            </button>
          </fieldset>
          <UFormField
            v-if="branchItems.length > 1"
            label="Batasi ke kantor"
            :help="data?.branchScopeAvailable ? 'Kosongkan untuk semua kantor.' : 'Pembatasan per kantor tersedia di paket Business.'"
          >
            <USelectMenu
              v-model="memberForm.branchIds"
              :items="branchItems"
              value-key="value"
              multiple
              placeholder="Semua kantor"
              :disabled="!data?.branchScopeAvailable"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            label="Simpan"
            :loading="savingMember"
          />
        </form>
      </template>
    </USlideover>
  </PagePanel>
</template>
