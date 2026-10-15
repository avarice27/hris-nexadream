<script setup lang="ts">
// Struktur organisasi: departemen, jabatan, dan kalender libur perusahaan.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Organisasi' })

interface Dept { id: string, name: string, code: string | null, parentId: string | null, isActive: boolean, employeeCount: number }
interface Pos { id: string, name: string, level: number | null, isActive: boolean, employeeCount: number }
interface Holiday { id: string, date: string, name: string, isCollectiveLeave: boolean, branchId: string | null }

const auth = useTenantAuth()
const toast = useApiToast()
const { confirm } = useConfirmDialog()
const org = useOrgOptions()
const tab = ref('departments')
const departments = ref<Dept[] | null>(null)
const positions = ref<Pos[] | null>(null)
const holidays = ref<Holiday[] | null>(null)
const year = ref(Number(localTodayKey().slice(0, 4)))

async function load() {
  try {
    const [d, p, h] = await Promise.all([
      apiFetch<{ items: Dept[] }>('/api/app/departments'),
      apiFetch<{ items: Pos[] }>('/api/app/positions'),
      apiFetch<{ items: Holiday[] }>('/api/app/holidays', { query: { year: year.value } })
    ])
    departments.value = d.items
    positions.value = p.items
    holidays.value = h.items
    await org.load(true)
  } catch (error) {
    toast.error(error)
  }
}
onMounted(load)
watch(year, load)
const deptName = (id: string | null) => departments.value?.find(d => d.id === id)?.name ?? '-'

// Form generik
const open = ref(false)
const kind = ref<'department' | 'position' | 'holiday'>('department')
const editingId = ref<string | null>(null)
const form = reactive({ name: '', code: '', parentId: undefined as string | undefined, level: undefined as number | undefined, date: '', isCollectiveLeave: false, branchId: undefined as string | undefined, isActive: true })
const formError = ref('')
function openForm(k: typeof kind.value, row?: Dept | Pos | Holiday) {
  kind.value = k
  editingId.value = row?.id ?? null
  formError.value = ''
  Object.assign(form, {
    name: row?.name ?? '', code: (row as Dept)?.code ?? '', parentId: (row as Dept)?.parentId ?? undefined, level: (row as Pos)?.level ?? undefined,
    date: (row as Holiday)?.date ?? `${year.value}-01-01`, isCollectiveLeave: (row as Holiday)?.isCollectiveLeave ?? false, branchId: (row as Holiday)?.branchId ?? undefined,
    isActive: (row as Dept)?.isActive ?? true
  })
  open.value = true
}
const paths = { department: '/api/app/departments', position: '/api/app/positions', holiday: '/api/app/holidays' }
async function save() {
  formError.value = ''
  const body = kind.value === 'department'
    ? { name: form.name, code: form.code || null, parentId: form.parentId ?? null, isActive: form.isActive }
    : kind.value === 'position'
      ? { name: form.name, level: form.level ?? null, isActive: form.isActive }
      : { name: form.name, date: form.date, isCollectiveLeave: form.isCollectiveLeave, branchId: form.branchId ?? null }
  try {
    if (editingId.value) await apiFetch(`${paths[kind.value]}/${editingId.value}`, { method: 'PATCH', body })
    else await apiFetch(paths[kind.value], { method: 'POST', body })
    open.value = false
    toast.success('Tersimpan')
    await load()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  }
}
async function remove(k: typeof kind.value, row: { id: string, name: string }) {
  if (!await confirm({ title: `Hapus ${row.name}?`, confirmLabel: 'Hapus', color: 'error' })) return
  try {
    await apiFetch(`${paths[k]}/${row.id}`, { method: 'DELETE' })
    toast.success('Dihapus')
    await load()
  } catch (error) {
    toast.error(error)
  }
}
async function importNational() {
  try {
    const res = await apiFetch<{ created: number, skipped: number }>('/api/app/holidays/import', { method: 'POST', body: { year: year.value } })
    toast.success(`${res.created} libur nasional ditambahkan`, res.skipped ? `${res.skipped} sudah ada.` : undefined)
    await load()
  } catch (error) {
    toast.error(error)
  }
}
const canHolidays = computed(() => auth.hasAbility('attendance.write'))
const titles = { department: 'departemen', position: 'jabatan', holiday: 'hari libur' }
const yearOptions = computed(() => [year.value - 1, year.value, year.value + 1].map(y => ({ label: String(y), value: y })))
const parentOptions = computed(() => (departments.value ?? []).filter(d => d.id !== editingId.value).map(d => ({ label: d.name, value: d.id })))
</script>

<template>
  <PagePanel title="Organisasi">
    <div class="space-y-4">
      <UTabs
        v-model="tab"
        :items="[{ label: 'Departemen', value: 'departments', icon: 'i-lucide-network' }, { label: 'Jabatan', value: 'positions', icon: 'i-lucide-briefcase' }, { label: 'Hari libur', value: 'holidays', icon: 'i-lucide-calendar-heart' }]"
        :content="false"
      />

      <template v-if="tab === 'departments'">
        <UButton
          label="Departemen baru"
          icon="i-lucide-plus"
          size="sm"
          @click="openForm('department')"
        />
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="d in departments ?? []"
              :key="d.id"
              class="flex items-center gap-3 px-4 py-3 text-sm"
              :class="d.isActive ? '' : 'opacity-60'"
            >
              <div class="flex-1">
                <p class="font-medium">
                  {{ d.name }} <span
                    v-if="d.code"
                    class="font-mono text-xs text-muted"
                  >{{ d.code }}</span>
                </p>
                <p
                  v-if="d.parentId"
                  class="text-xs text-muted"
                >
                  Bagian dari {{ deptName(d.parentId) }}
                </p>
              </div>
              <span class="text-muted">{{ d.employeeCount }} orang</span>
              <UButton
                icon="i-lucide-pencil"
                size="xs"
                variant="ghost"
                color="neutral"
                aria-label="Ubah"
                @click="openForm('department', d)"
              />
              <UButton
                v-if="!d.employeeCount"
                icon="i-lucide-trash-2"
                size="xs"
                variant="ghost"
                color="error"
                aria-label="Hapus"
                @click="remove('department', d)"
              />
            </li>
          </ul>
          <p
            v-if="departments && !departments.length"
            class="p-6 text-center text-sm text-muted"
          >
            Belum ada departemen.
          </p>
        </UCard>
      </template>

      <template v-if="tab === 'positions'">
        <UButton
          label="Jabatan baru"
          icon="i-lucide-plus"
          size="sm"
          @click="openForm('position')"
        />
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="p in positions ?? []"
              :key="p.id"
              class="flex items-center gap-3 px-4 py-3 text-sm"
              :class="p.isActive ? '' : 'opacity-60'"
            >
              <span class="flex-1 font-medium">{{ p.name }} <span
                v-if="p.level"
                class="text-xs text-muted"
              >· level {{ p.level }}</span></span>
              <span class="text-muted">{{ p.employeeCount }} orang</span>
              <UButton
                icon="i-lucide-pencil"
                size="xs"
                variant="ghost"
                color="neutral"
                aria-label="Ubah"
                @click="openForm('position', p)"
              />
              <UButton
                v-if="!p.employeeCount"
                icon="i-lucide-trash-2"
                size="xs"
                variant="ghost"
                color="error"
                aria-label="Hapus"
                @click="remove('position', p)"
              />
            </li>
          </ul>
        </UCard>
      </template>

      <template v-if="tab === 'holidays'">
        <div class="flex flex-wrap items-center gap-2">
          <USelect
            v-model="year"
            :items="yearOptions"
            class="w-28"
          />
          <template v-if="canHolidays">
            <UButton
              label="Hari libur baru"
              icon="i-lucide-plus"
              size="sm"
              @click="openForm('holiday')"
            />
            <UButton
              label="Ambil libur nasional"
              icon="i-lucide-download"
              size="sm"
              variant="outline"
              @click="importNational"
            />
          </template>
        </div>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="h in holidays ?? []"
              :key="h.id"
              class="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <span class="w-32 font-medium">{{ formatDayShort(h.date) }}</span>
              <span class="flex-1">{{ h.name }}</span>
              <UBadge
                v-if="h.isCollectiveLeave"
                label="Cuti bersama"
                size="xs"
                variant="subtle"
              />
              <span
                v-if="h.branchId"
                class="text-xs text-muted"
              >{{ org.branchOptions.value.find(b => b.value === h.branchId)?.label }}</span>
              <template v-if="canHolidays">
                <UButton
                  icon="i-lucide-pencil"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  aria-label="Ubah"
                  @click="openForm('holiday', h)"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  size="xs"
                  variant="ghost"
                  color="error"
                  aria-label="Hapus"
                  @click="remove('holiday', h)"
                />
              </template>
            </li>
          </ul>
          <p
            v-if="holidays && !holidays.length"
            class="p-6 text-center text-sm text-muted"
          >
            Belum ada hari libur {{ year }}.
          </p>
        </UCard>
        <p class="text-xs text-muted">
          Hari libur tidak dihitung sebagai hari kerja untuk absensi dan cuti.
        </p>
      </template>
    </div>

    <UModal
      v-model:open="open"
      :title="`${editingId ? 'Ubah' : 'Tambah'} ${titles[kind]}`"
    >
      <template #body>
        <form
          id="org-form"
          class="space-y-4"
          @submit.prevent="save"
        >
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />
          <UFormField
            label="Nama"
            required
          >
            <UInput
              v-model="form.name"
              class="w-full"
            />
          </UFormField>
          <template v-if="kind === 'department'">
            <UFormField label="Kode">
              <UInput
                v-model="form.code"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Induk">
              <USelect
                v-model="form.parentId"
                :items="parentOptions"
                class="w-full"
                placeholder="Tanpa induk"
              />
            </UFormField>
          </template>
          <UFormField
            v-if="kind === 'position'"
            label="Level (1 = tertinggi)"
          >
            <UInputNumber
              v-model="form.level"
              :min="1"
              :max="20"
              class="w-full"
            />
          </UFormField>
          <template v-if="kind === 'holiday'">
            <UFormField label="Tanggal">
              <UInput
                v-model="form.date"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Berlaku untuk">
              <USelect
                v-model="form.branchId"
                :items="org.branchOptions.value"
                class="w-full"
                placeholder="Semua kantor"
              />
            </UFormField>
            <UCheckbox
              v-model="form.isCollectiveLeave"
              label="Cuti bersama"
            />
          </template>
          <UCheckbox
            v-if="kind !== 'holiday' && editingId"
            v-model="form.isActive"
            label="Aktif"
          />
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Batal"
            variant="ghost"
            color="neutral"
            @click="open = false"
          />
          <UButton
            type="submit"
            form="org-form"
            label="Simpan"
          />
        </div>
      </template>
    </UModal>
  </PagePanel>
</template>
