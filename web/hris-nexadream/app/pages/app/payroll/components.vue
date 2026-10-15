<script setup lang="ts">
// Komponen gaji perusahaan (tunjangan & potongan tetap). Kode dan jenis tidak bisa diubah setelah dibuat.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Komponen gaji' })

interface Component { id: string, code: string, name: string, kind: 'earning' | 'deduction', taxable: boolean, bpjsBase: boolean, thrBase: boolean, isActive: boolean, order: number }
const toast = useApiToast()
const entitlements = useEntitlements()
const items = ref<Component[] | null>(null)
async function load() {
  try {
    items.value = (await apiFetch<{ items: Component[] }>('/api/app/payroll/components')).items
  } catch (error) {
    toast.error(error)
  }
}
onMounted(load)
const open = ref(false)
const editing = ref<string | null>(null)
const formError = ref('')
const form = reactive({ code: '', name: '', kind: 'earning' as 'earning' | 'deduction', taxable: true, bpjsBase: false, thrBase: false, isActive: true })
function openForm(c?: Component) {
  editing.value = c?.id ?? null
  formError.value = ''
  Object.assign(form, c ?? { code: '', name: '', kind: 'earning', taxable: true, bpjsBase: false, thrBase: false, isActive: true })
  open.value = true
}
async function save() {
  try {
    if (editing.value) await apiFetch(`/api/app/payroll/components/${editing.value}`, { method: 'PATCH', body: { name: form.name, taxable: form.taxable, bpjsBase: form.bpjsBase, thrBase: form.thrBase, isActive: form.isActive } })
    else await apiFetch('/api/app/payroll/components', { method: 'POST', body: form })
    open.value = false
    toast.success('Komponen disimpan')
    await load()
  } catch (error) {
    if (!entitlements.handlePlanError(error)) formError.value = extractErrorMessage(error)
  }
}
const kindOptions = [{ label: 'Pendapatan (tunjangan)', value: 'earning' }, { label: 'Potongan', value: 'deduction' }]
</script>

<template>
  <PagePanel title="Komponen gaji">
    <template #actions>
      <UButton
        label="Komponen baru"
        icon="i-lucide-plus"
        @click="openForm()"
      />
    </template>
    <div class="space-y-4">
      <UButton
        to="/app/payroll"
        icon="i-lucide-arrow-left"
        label="Payroll"
        variant="ghost"
        color="neutral"
        size="sm"
      />
      <p class="text-sm text-muted">
        Gaji pokok, PPh 21, BPJS, lembur, THR, dan reimbursement dihitung otomatis — tidak perlu dibuat sebagai komponen.
        Nominal per karyawan diisi di tab Gaji pada data karyawan.
      </p>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li
            v-for="c in items ?? []"
            :key="c.id"
            class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
            :class="c.isActive ? '' : 'opacity-60'"
          >
            <span class="font-mono text-xs text-muted">{{ c.code }}</span>
            <span class="flex-1 font-medium">{{ c.name }}</span>
            <UBadge
              :label="c.kind === 'earning' ? 'Pendapatan' : 'Potongan'"
              :color="c.kind === 'earning' ? 'success' : 'warning'"
              variant="subtle"
              size="xs"
            />
            <span class="text-xs text-muted">{{ [c.taxable && c.kind === 'earning' ? 'kena PPh' : null, c.bpjsBase ? 'dasar BPJS' : null, c.thrBase ? 'dasar THR' : null].filter(Boolean).join(' · ') }}</span>
            <UButton
              icon="i-lucide-pencil"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Ubah"
              @click="openForm(c)"
            />
          </li>
        </ul>
      </UCard>
    </div>
    <UModal
      v-model:open="open"
      :title="editing ? 'Ubah komponen' : 'Komponen baru'"
    >
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
            class="sm:col-span-2"
          />
          <UFormField label="Kode">
            <UInput
              v-model="form.code"
              :disabled="!!editing"
              class="w-full font-mono"
              placeholder="HOUSING"
            />
          </UFormField>
          <UFormField label="Nama">
            <UInput
              v-model="form.name"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Jenis"
            class="sm:col-span-2"
          >
            <USelect
              v-model="form.kind"
              :items="kindOptions"
              :disabled="!!editing"
              class="w-full"
            />
          </UFormField>
          <template v-if="form.kind === 'earning'">
            <UCheckbox
              v-model="form.taxable"
              label="Kena PPh 21"
            />
            <UCheckbox
              v-model="form.bpjsBase"
              label="Tunjangan tetap (dasar BPJS & lembur)"
            />
            <UCheckbox
              v-model="form.thrBase"
              label="Dasar THR"
            />
          </template>
          <UCheckbox
            v-if="editing"
            v-model="form.isActive"
            label="Aktif"
          />
        </div>
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
            label="Simpan"
            @click="save"
          />
        </div>
      </template>
    </UModal>
  </PagePanel>
</template>
