<script setup lang="ts">
// Impor karyawan dari CSV (Excel → Simpan sebagai CSV). Pratinjau dulu, simpan hanya bila tanpa galat.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Impor karyawan' })

interface Preview {
  rows: Array<{ line: number, fullName: string, errors: string[] }>
  validCount: number
  errorCount: number
  newDepartments: string[]
  newPositions: string[]
  limit: { used: number, max: number, overLimit: boolean }
}
const toast = useApiToast()
const entitlements = useEntitlements()
const csv = ref('')
const fileName = ref('')
const preview = ref<Preview | null>(null)
const busy = ref(false)
const errorMessage = ref('')
const done = ref<{ created: number } | null>(null)

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 2_000_000) {
    errorMessage.value = 'File terlalu besar (maks. 2 MB).'
    return
  }
  fileName.value = file.name
  csv.value = await file.text()
  done.value = null
  await runPreview()
}
async function runPreview() {
  busy.value = true
  errorMessage.value = ''
  try {
    preview.value = await apiFetch<Preview>('/api/app/employees/import/preview', { method: 'POST', body: { csv: csv.value } })
  } catch (error) {
    preview.value = null
    if (!entitlements.handlePlanError(error)) errorMessage.value = extractErrorMessage(error)
  } finally {
    busy.value = false
  }
}
async function commit() {
  busy.value = true
  try {
    done.value = await apiFetch<{ created: number }>('/api/app/employees/import/commit', { method: 'POST', body: { csv: csv.value } })
    toast.success(`${done.value.created} karyawan diimpor`)
    preview.value = null
  } catch (error) {
    toast.error(error)
  } finally {
    busy.value = false
  }
}
async function template() {
  await downloadFromApi('/api/app/employees/import-template', 'templat-impor-karyawan.csv').catch(toast.error)
}
const problems = computed(() => preview.value?.rows.filter(r => r.errors.length) ?? [])
</script>

<template>
  <PagePanel title="Impor karyawan">
    <div class="max-w-3xl space-y-5">
      <UButton
        to="/app/employees"
        icon="i-lucide-arrow-left"
        label="Daftar karyawan"
        variant="ghost"
        color="neutral"
        size="sm"
      />
      <UCard>
        <ol class="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Unduh <button
              type="button"
              class="text-primary underline"
              @click="template"
            >
              templat CSV
            </button>, isi di Excel atau Google Sheets (satu baris per karyawan).
          </li>
          <li>Simpan sebagai <strong>CSV</strong>. Kolom wajib: Nama lengkap, Tanggal masuk (YYYY-MM-DD), Kantor (bila lebih dari satu kantor).</li>
          <li>Departemen dan jabatan yang belum ada akan dibuat otomatis. NIK, NPWP, dan rekening langsung dienkripsi.</li>
        </ol>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <label class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-default px-3 py-2 text-sm hover:bg-elevated">
            <UIcon
              name="i-lucide-file-up"
              class="size-4"
            /> Pilih file CSV
            <input
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              @change="onFile"
            >
          </label>
          <span
            v-if="fileName"
            class="text-sm text-muted"
          >{{ fileName }}</span>
        </div>
      </UCard>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        :title="errorMessage"
      />
      <UAlert
        v-if="done"
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        :title="`${done.created} karyawan berhasil diimpor.`"
        description="Lanjutkan dengan mengisi gaji dan mengundang karyawan ke layanan mandiri."
        :actions="[{ label: 'Lihat karyawan', to: '/app/employees' }]"
      />

      <UCard v-if="preview">
        <div class="flex flex-wrap items-center gap-3">
          <p class="text-sm">
            <strong class="text-success">{{ preview.validCount }}</strong> baris siap ·
            <strong :class="preview.errorCount ? 'text-error' : ''">{{ preview.errorCount }}</strong> bermasalah
          </p>
          <UButton
            class="ml-auto"
            label="Impor sekarang"
            icon="i-lucide-check"
            :disabled="!!preview.errorCount || !preview.validCount || preview.limit.overLimit"
            :loading="busy"
            @click="commit"
          />
        </div>
        <UAlert
          v-if="preview.limit.overLimit"
          class="mt-3"
          color="warning"
          variant="subtle"
          :title="`Melebihi batas paket: ${preview.limit.used} + ${preview.validCount} > ${preview.limit.max} karyawan.`"
          :actions="[{ label: 'Lihat paket', onClick: () => entitlements.limitReached('employees') }]"
        />
        <p
          v-if="preview.newDepartments.length || preview.newPositions.length"
          class="mt-3 text-sm text-muted"
        >
          Akan dibuat: {{ [...preview.newDepartments.map(d => `departemen ${d}`), ...preview.newPositions.map(p => `jabatan ${p}`)].join(', ') }}
        </p>
        <table
          v-if="problems.length"
          class="mt-4 w-full text-sm"
        >
          <thead class="text-left text-xs text-muted">
            <tr>
              <th class="py-1 font-normal">
                Baris
              </th>
              <th class="py-1 font-normal">
                Nama
              </th>
              <th class="py-1 font-normal">
                Masalah
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr
              v-for="r in problems"
              :key="r.line"
            >
              <td class="py-1.5 tabular">
                {{ r.line }}
              </td>
              <td class="py-1.5">
                {{ r.fullName || '-' }}
              </td>
              <td class="py-1.5 text-error">
                {{ r.errors.join(' ') }}
              </td>
            </tr>
          </tbody>
        </table>
      </UCard>
    </div>
  </PagePanel>
</template>
