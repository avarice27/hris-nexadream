<script setup lang="ts">
import { TIMEZONE_OPTIONS } from '#shared/utils/settings'
import { formatLimit } from '#shared/utils/plans'
import type { BranchSummary } from '~/composables/useActiveBranch'

definePageMeta({ layout: 'tenant' })
useHead({ title: 'Kantor' })

const branch = useActiveBranch()
const toast = useApiToast()
const { confirm } = useConfirmDialog()

const status = ref<'loading' | 'error' | 'success'>('loading')
const errorMessage = ref('')

async function reload() {
  try {
    await branch.load(true)
    status.value = 'success'
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
    status.value = 'error'
  }
}
onMounted(reload)

const zoneLabel = (tz: string) => TIMEZONE_OPTIONS.find(o => o.value === tz)?.label.split(' ')[0] ?? tz
const atLimit = computed(() => branch.usage.value.limit !== -1 && branch.usage.value.active >= branch.usage.value.limit)

// Form
const editingId = ref<string | null>(null)
const open = ref(false)
const saving = ref(false)
const formError = ref('')
const form = reactive({
  name: '',
  address: '',
  phone: '',
  timezone: 'Asia/Jakarta',
  useGeofence: false,
  latitude: undefined as number | undefined,
  longitude: undefined as number | undefined,
  geofenceRadiusMeters: 100
})

function openCreate() {
  if (atLimit.value) {
    useEntitlements().limitReached('branches')
    return
  }
  editingId.value = null
  Object.assign(form, { name: '', address: '', phone: '', timezone: 'Asia/Jakarta', useGeofence: false, latitude: undefined, longitude: undefined, geofenceRadiusMeters: 100 })
  formError.value = ''
  open.value = true
}

function openEdit(row: BranchSummary) {
  editingId.value = row.id
  Object.assign(form, {
    name: row.name,
    address: row.address ?? '',
    phone: row.phone ?? '',
    timezone: row.timezone,
    useGeofence: row.latitude !== null,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    geofenceRadiusMeters: row.geofenceRadiusMeters ?? 100
  })
  formError.value = ''
  open.value = true
}

function payload() {
  return {
    name: form.name,
    address: form.address || null,
    phone: form.phone || null,
    timezone: form.timezone,
    latitude: form.useGeofence ? (form.latitude ?? null) : null,
    longitude: form.useGeofence ? (form.longitude ?? null) : null,
    geofenceRadiusMeters: form.useGeofence ? form.geofenceRadiusMeters : null
  }
}

async function onSubmit() {
  saving.value = true
  formError.value = ''
  try {
    if (editingId.value) await apiFetch(`/api/app/branches/${editingId.value}`, { method: 'PATCH', body: payload() })
    else await apiFetch('/api/app/branches', { method: 'POST', body: payload() })
    open.value = false
    toast.success(editingId.value ? 'Kantor diperbarui' : 'Kantor ditambahkan')
    await reload()
  } catch (error) {
    if (extractStatusCode(error) === 402) toast.error(error)
    else formError.value = extractErrorMessage(error)
  } finally {
    saving.value = false
  }
}

function useMyLocation() {
  navigator.geolocation?.getCurrentPosition(
    (pos) => {
      form.latitude = Number(pos.coords.latitude.toFixed(6))
      form.longitude = Number(pos.coords.longitude.toFixed(6))
    },
    () => { formError.value = 'Lokasi tidak bisa dibaca. Izinkan akses lokasi atau isi koordinat manual.' }
  )
}

async function setActive(row: BranchSummary, isActive: boolean) {
  if (!isActive) {
    const ok = await confirm({
      title: `Nonaktifkan ${row.name}?`,
      description: 'Kantor nonaktif tidak bisa dipilih untuk absensi baru. Riwayatnya tetap tersimpan dan bisa diaktifkan kembali.',
      confirmLabel: 'Nonaktifkan',
      color: 'warning'
    })
    if (!ok) return
  }
  try {
    await apiFetch(`/api/app/branches/${row.id}`, {
      method: 'PATCH',
      body: { ...rowPayload(row), isActive }
    })
    toast.success(isActive ? 'Kantor diaktifkan' : 'Kantor dinonaktifkan')
    await reload()
  } catch (error) {
    toast.error(error)
  }
}

function rowPayload(row: BranchSummary) {
  return {
    name: row.name, address: row.address, phone: row.phone, timezone: row.timezone,
    latitude: row.latitude, longitude: row.longitude, geofenceRadiusMeters: row.geofenceRadiusMeters
  }
}

async function makePrimary(row: BranchSummary) {
  try {
    await apiFetch(`/api/app/branches/${row.id}/primary`, { method: 'POST' })
    toast.success(`${row.name} kini kantor utama`)
    await reload()
  } catch (error) {
    toast.error(error)
  }
}

async function remove(row: BranchSummary) {
  const ok = await confirm({
    title: `Hapus ${row.name}?`,
    description: 'Kantor dihapus permanen. Bila kantor sudah punya riwayat, nonaktifkan saja.',
    confirmLabel: 'Hapus',
    color: 'error'
  })
  if (!ok) return
  try {
    await apiFetch(`/api/app/branches/${row.id}`, { method: 'DELETE' })
    toast.success('Kantor dihapus')
    await reload()
  } catch (error) {
    toast.error(error)
  }
}

function rowActions(row: BranchSummary) {
  return [[
    { label: 'Ubah', icon: 'i-lucide-pencil', onSelect: () => openEdit(row) },
    ...(!row.isPrimary && row.isActive ? [{ label: 'Jadikan kantor utama', icon: 'i-lucide-star', onSelect: () => makePrimary(row) }] : []),
    ...(!row.isPrimary
      ? [row.isActive
          ? { label: 'Nonaktifkan', icon: 'i-lucide-power-off', onSelect: () => setActive(row, false) }
          : { label: 'Aktifkan', icon: 'i-lucide-power', onSelect: () => setActive(row, true) }]
      : [])
  ], ...(!row.isPrimary ? [[{ label: 'Hapus', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(row) }]] : [])]
}
</script>

<template>
  <PagePanel title="Pengaturan">
    <template #actions>
      <UButton
        label="Tambah kantor"
        icon="i-lucide-plus"
        @click="openCreate"
      />
    </template>

    <SettingsNav />

    <div class="space-y-4">
      <p class="text-sm text-muted">
        {{ branch.usage.value.active }} dari {{ formatLimit('branches', branch.usage.value.limit) }} kantor aktif.
        <span v-if="atLimit">Batas paket tercapai — <ULink
          to="/app/billing"
          class="text-primary"
        >tingkatkan paket</ULink> untuk menambah kantor.</span>
      </p>

      <div
        v-if="status === 'loading'"
        class="space-y-2"
      >
        <USkeleton
          v-for="i in 3"
          :key="i"
          class="h-20 w-full"
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
        v-else
        class="grid gap-3 md:grid-cols-2"
      >
        <UCard
          v-for="row in branch.branches.value"
          :key="row.id"
          :class="row.isActive ? '' : 'opacity-70'"
        >
          <div class="flex items-start gap-3">
            <UIcon
              name="i-lucide-building"
              class="mt-0.5 size-5 text-primary"
            />
            <div class="min-w-0 flex-1 space-y-1">
              <p class="flex flex-wrap items-center gap-2 font-medium">
                {{ row.name }}
                <UBadge
                  v-if="row.isPrimary"
                  label="Utama"
                  size="sm"
                  variant="subtle"
                />
                <UBadge
                  v-if="!row.isActive"
                  label="Nonaktif"
                  size="sm"
                  color="neutral"
                  variant="subtle"
                />
              </p>
              <p
                v-if="row.address"
                class="text-sm text-muted"
              >
                {{ row.address }}
              </p>
              <p class="flex flex-wrap gap-3 text-xs text-dimmed">
                <span>{{ zoneLabel(row.timezone) }}</span>
                <span v-if="row.code">Kode {{ row.code }}</span>
                <span v-if="row.latitude !== null">Geofence {{ row.geofenceRadiusMeters }} m</span>
              </p>
            </div>
            <UDropdownMenu
              :items="rowActions(row)"
              :content="{ align: 'end' }"
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                variant="ghost"
                color="neutral"
                aria-label="Aksi kantor"
              />
            </UDropdownMenu>
          </div>
        </UCard>
      </div>
    </div>

    <USlideover
      v-model:open="open"
      :title="editingId ? 'Ubah kantor' : 'Tambah kantor'"
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="onSubmit"
        >
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="formError"
          />
          <UFormField
            label="Nama kantor"
            required
          >
            <UInput
              v-model="form.name"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Alamat">
            <UTextarea
              v-model="form.address"
              :rows="2"
              autoresize
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
            label="Zona waktu"
            help="Menentukan tanggal & jam absensi karyawan di kantor ini."
          >
            <USelect
              v-model="form.timezone"
              :items="TIMEZONE_OPTIONS"
              class="w-full"
            />
          </UFormField>

          <USeparator />

          <USwitch
            v-model="form.useGeofence"
            label="Batasi absensi di area kantor (geofence)"
            :description="branch.geofenceAvailable.value ? 'Karyawan hanya bisa absen di dalam radius kantor.' : 'Tersedia di paket Growth ke atas.'"
            :disabled="!branch.geofenceAvailable.value && !form.useGeofence"
          />
          <template v-if="form.useGeofence">
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Lintang (latitude)">
                <UInputNumber
                  v-model="form.latitude"
                  :step="0.000001"
                  :format-options="{ maximumFractionDigits: 6 }"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Bujur (longitude)">
                <UInputNumber
                  v-model="form.longitude"
                  :step="0.000001"
                  :format-options="{ maximumFractionDigits: 6 }"
                  class="w-full"
                />
              </UFormField>
            </div>
            <UButton
              label="Pakai lokasi saya saat ini"
              icon="i-lucide-locate-fixed"
              size="sm"
              variant="outline"
              @click="useMyLocation"
            />
            <UFormField label="Radius (meter)">
              <UInputNumber
                v-model="form.geofenceRadiusMeters"
                :min="20"
                :max="5000"
                :step="10"
                class="w-full sm:w-40"
              />
            </UFormField>
          </template>

          <UButton
            type="submit"
            :label="editingId ? 'Simpan' : 'Tambah kantor'"
            :loading="saving"
          />
        </form>
      </template>
    </USlideover>
  </PagePanel>
</template>
