<script setup lang="ts">
import { formatLimit } from '#shared/utils/plans'

// Dialog pemblokir setelah turun paket: pilih kantor yang tetap aktif (≤ batas paket).
const auth = useTenantAuth()
const branch = useActiveBranch()
const entitlements = useEntitlements()
const toast = useApiToast()

const open = computed(() => !!auth.tenant.value?.needsBranchSelection && auth.hasAbility('branches.manage'))
const selected = ref<string[]>([])
const saving = ref(false)
const max = computed(() => entitlements.limit('branches'))

watch(open, async (isOpen) => {
  if (!isOpen) return
  await Promise.all([branch.load(true), entitlements.load()])
  selected.value = branch.branches.value.filter(b => b.isActive).map(b => b.id).slice(0, Math.max(1, max.value))
}, { immediate: true })

function toggle(id: string) {
  if (selected.value.includes(id)) selected.value = selected.value.filter(x => x !== id)
  else if (max.value === -1 || selected.value.length < max.value) selected.value = [...selected.value, id]
}

async function save() {
  saving.value = true
  try {
    await apiFetch('/api/app/subscription/select-branch', { method: 'POST', body: { branchIds: selected.value } })
    await Promise.all([auth.fetchProfile(), branch.load(true), entitlements.refresh()])
    toast.success('Kantor aktif disimpan')
  } catch (error) {
    toast.error(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    title="Pilih kantor yang tetap aktif"
    :description="`Paket Anda kini mengizinkan ${formatLimit('branches', max)} kantor aktif. Kantor lain dinonaktifkan sementara — datanya tidak dihapus dan bisa diaktifkan lagi setelah upgrade.`"
    :dismissible="false"
    :close="false"
  >
    <template #body>
      <ul class="space-y-2">
        <li
          v-for="b in branch.branches.value"
          :key="b.id"
        >
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-md border p-3 text-left"
            :class="selected.includes(b.id) ? 'border-primary bg-primary/5' : 'border-default hover:bg-elevated'"
            :aria-pressed="selected.includes(b.id)"
            @click="toggle(b.id)"
          >
            <UIcon
              :name="selected.includes(b.id) ? 'i-lucide-check-square' : 'i-lucide-square'"
              class="size-5 text-primary"
            />
            <span class="flex-1 text-sm font-medium">{{ b.name }}</span>
            <UBadge
              v-if="b.isPrimary"
              label="Utama"
              size="sm"
              variant="subtle"
            />
          </button>
        </li>
      </ul>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton
          to="/app/billing"
          label="Lihat paket"
          variant="ghost"
          color="neutral"
        />
        <UButton
          label="Simpan pilihan"
          :loading="saving"
          :disabled="!selected.length"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
