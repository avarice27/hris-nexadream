<script setup lang="ts">
// Data referensi statutori (berlaku-tanggal): tarif payroll (TER PPh 21, Pasal 17, PTKP, BPJS) dan libur nasional.
// Payroll suatu periode memakai versi yang berlaku pada akhir periode. Run yang sudah disetujui menyimpan snapshot.
definePageMeta({ layout: 'admin' })
useHead({ title: 'Data referensi' })

interface Row { id: string, key: 'payroll' | 'national_holidays', effectiveFrom: string, data: unknown, note: string | null, updatedAt: string }
const auth = usePlatformAuth()
const toast = useToast()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('reference-data.write'))
const rows = ref<Row[] | null>(null)
const defaults = ref<{ payroll: unknown } | null>(null)
const errorMessage = ref('')
async function load() {
  try {
    const res = await apiFetch<{ items: Row[], defaults: { payroll: unknown } }>('/api/admin/reference-data')
    rows.value = res.items
    defaults.value = res.defaults
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)
const notify = (title: string, ok = true) => toast.add({ title, color: ok ? 'success' : 'error', icon: ok ? 'i-lucide-check' : 'i-lucide-circle-alert' })

const payrollRows = computed(() => rows.value?.filter(r => r.key === 'payroll') ?? [])
const holidayRows = computed(() => rows.value?.filter(r => r.key === 'national_holidays') ?? [])

// Editor tarif payroll (JSON tervalidasi server)
const payrollOpen = ref(false)
const payrollForm = reactive({ effectiveFrom: '', json: '', note: '' })
const formError = ref('')
function openPayroll(row?: Row) {
  const base = row?.data ?? payrollRows.value[0]?.data ?? defaults.value?.payroll
  Object.assign(payrollForm, { effectiveFrom: row?.effectiveFrom ?? `${new Date().getFullYear() + 1}-01-01`, json: JSON.stringify(base, null, 2), note: row?.note ?? '' })
  formError.value = ''
  payrollOpen.value = true
}
async function savePayroll() {
  formError.value = ''
  let data: unknown
  try {
    data = JSON.parse(payrollForm.json)
  } catch {
    formError.value = 'JSON tidak valid.'
    return
  }
  try {
    await apiFetch('/api/admin/reference-data', { method: 'POST', body: { key: 'payroll', effectiveFrom: payrollForm.effectiveFrom, data, note: payrollForm.note || null } })
    payrollOpen.value = false
    notify('Tarif payroll disimpan')
    await load()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  }
}

// Editor libur nasional per tahun
const holidayOpen = ref(false)
const holidayYear = ref(new Date().getFullYear())
const holidayItems = ref<Array<{ date: string, name: string, isCollectiveLeave: boolean }>>([])
const holidayNote = ref('')
function openHolidays(row?: Row) {
  holidayYear.value = row ? Number(row.effectiveFrom.slice(0, 4)) : new Date().getFullYear() + 1
  holidayItems.value = row ? ((row.data as { items: Array<{ date: string, name: string, isCollectiveLeave?: boolean }> }).items.map(i => ({ ...i, isCollectiveLeave: !!i.isCollectiveLeave }))) : []
  holidayNote.value = row?.note ?? ''
  formError.value = ''
  holidayOpen.value = true
}
async function saveHolidays() {
  formError.value = ''
  try {
    await apiFetch('/api/admin/reference-data', { method: 'POST', body: { key: 'national_holidays', effectiveFrom: `${holidayYear.value}-01-01`, data: { items: holidayItems.value.filter(i => i.date && i.name.trim()) }, note: holidayNote.value || null } })
    holidayOpen.value = false
    notify('Libur nasional disimpan')
    await load()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  }
}
async function remove(row: Row) {
  if (!await confirm({ title: `Hapus versi ${row.effectiveFrom}?`, confirmLabel: 'Hapus', color: 'error' })) return
  try {
    await apiFetch(`/api/admin/reference-data/${row.id}`, { method: 'DELETE' })
    notify('Dihapus')
    await load()
  } catch (error) {
    notify(extractErrorMessage(error), false)
  }
}
const summary = (data: unknown) => {
  const d = data as { bpjs?: { jpWageCap?: number, kesehatanWageCap?: number }, ptkp?: { base?: number } }
  return `PTKP TK/0 ${formatIDR(d.ptkp?.base ?? 0)} · batas upah BPJS Kes ${formatIDR(d.bpjs?.kesehatanWageCap ?? 0)} · batas JP ${formatIDR(d.bpjs?.jpWageCap ?? 0)}`
}
</script>

<template>
  <PagePanel title="Data referensi">
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />
    <div
      v-else
      class="space-y-6"
    >
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-scale"
        title="Tarif ini dipakai menghitung gaji semua perusahaan."
        description="Verifikasi dengan konsultan pajak sebelum mengubah. Tambahkan versi baru dengan tanggal berlaku — jangan menimpa versi yang sudah dipakai payroll."
      />
      <UCard>
        <div class="mb-3 flex items-center justify-between gap-3">
          <p class="font-semibold">
            Tarif payroll (PPh 21 TER, Pasal 17, PTKP, BPJS)
          </p>
          <UButton
            v-if="canWrite"
            label="Versi baru"
            icon="i-lucide-plus"
            size="sm"
            @click="openPayroll()"
          />
        </div>
        <ul class="divide-y divide-default text-sm">
          <li
            v-for="r in payrollRows"
            :key="r.id"
            class="flex flex-wrap items-center gap-3 py-2.5"
          >
            <span class="w-36 font-medium">Berlaku {{ formatDateShort(r.effectiveFrom) }}</span>
            <span class="flex-1 text-muted">{{ summary(r.data) }}<span v-if="r.note"> — {{ r.note }}</span></span>
            <UButton
              v-if="canWrite"
              icon="i-lucide-pencil"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Ubah"
              @click="openPayroll(r)"
            />
            <UButton
              v-if="canWrite && payrollRows.length > 1"
              icon="i-lucide-trash-2"
              size="xs"
              variant="ghost"
              color="error"
              aria-label="Hapus"
              @click="remove(r)"
            />
          </li>
          <li
            v-if="!payrollRows.length"
            class="py-3 text-muted"
          >
            Belum ada versi — payroll memakai nilai bawaan aplikasi.
          </li>
        </ul>
      </UCard>

      <UCard>
        <div class="mb-3 flex items-center justify-between gap-3">
          <p class="font-semibold">
            Libur nasional
          </p>
          <UButton
            v-if="canWrite"
            label="Tahun baru"
            icon="i-lucide-plus"
            size="sm"
            @click="openHolidays()"
          />
        </div>
        <ul class="divide-y divide-default text-sm">
          <li
            v-for="r in holidayRows"
            :key="r.id"
            class="flex flex-wrap items-center gap-3 py-2.5"
          >
            <span class="w-24 font-medium">{{ r.effectiveFrom.slice(0, 4) }}</span>
            <span class="flex-1 text-muted">{{ (r.data as { items: unknown[] }).items.length }} tanggal<span v-if="r.note"> — {{ r.note }}</span></span>
            <UButton
              v-if="canWrite"
              icon="i-lucide-pencil"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Ubah"
              @click="openHolidays(r)"
            />
          </li>
        </ul>
        <p class="mt-2 text-xs text-muted">
          Perusahaan mengambil daftar ini lewat Organisasi → Hari libur → "Ambil libur nasional".
        </p>
      </UCard>
    </div>

    <USlideover
      v-model:open="payrollOpen"
      title="Tarif payroll"
      :ui="{ content: 'max-w-3xl' }"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Berlaku mulai">
              <UInput
                v-model="payrollForm.effectiveFrom"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Catatan / sumber">
              <UInput
                v-model="payrollForm.note"
                class="w-full"
                placeholder="Mis. PMK 168/2023; batas JP 2026"
              />
            </UFormField>
          </div>
          <UFormField
            label="Data (JSON)"
            hint="rate dalam persen; upTo null = lapisan teratas"
          >
            <UTextarea
              v-model="payrollForm.json"
              :rows="24"
              class="w-full font-mono text-xs"
            />
          </UFormField>
          <UButton
            label="Simpan versi"
            @click="savePayroll"
          />
        </div>
      </template>
    </USlideover>

    <USlideover
      v-model:open="holidayOpen"
      :title="`Libur nasional ${holidayYear}`"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <div class="space-y-3">
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />
          <UFormField label="Tahun">
            <UInputNumber
              v-model="holidayYear"
              :min="2020"
              :max="2100"
              class="w-32"
            />
          </UFormField>
          <div
            v-for="(h, i) in holidayItems"
            :key="i"
            class="flex flex-wrap items-center gap-2"
          >
            <UInput
              v-model="h.date"
              type="date"
              class="w-44"
            />
            <UInput
              v-model="h.name"
              class="min-w-48 flex-1"
              placeholder="Nama libur"
            />
            <UCheckbox
              v-model="h.isCollectiveLeave"
              label="Cuti bersama"
            />
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              aria-label="Hapus"
              @click="holidayItems.splice(i, 1)"
            />
          </div>
          <UButton
            label="Tambah tanggal"
            icon="i-lucide-plus"
            size="sm"
            variant="outline"
            @click="holidayItems.push({ date: `${holidayYear}-01-01`, name: '', isCollectiveLeave: false })"
          />
          <UFormField label="Catatan / sumber">
            <UInput
              v-model="holidayNote"
              class="w-full"
              placeholder="SKB 3 Menteri …"
            />
          </UFormField>
          <UButton
            label="Simpan"
            @click="saveHolidays"
          />
        </div>
      </template>
    </USlideover>
  </PagePanel>
</template>
