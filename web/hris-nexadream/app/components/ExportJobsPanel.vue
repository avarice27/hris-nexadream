<script setup lang="ts">
import { EXPORT_KINDS, EXPORT_KIND_LABELS, EXPORT_KINDS_WITH_RANGE, type ExportKind } from '#shared/utils/exports'

// Ekspor besar sebagai pekerjaan latar: dibuat, lalu halaman ini menjalankan langkah-langkahnya
// (/step) sampai selesai. Bila halaman ditutup, cron harian melanjutkannya. Berkas tersedia 24 jam.
interface Job { id: string, kind: string, kindLabel: string, status: 'queued' | 'running' | 'completed' | 'failed', rowCount: number, error: string | null, ready: boolean, createdAt: string, expiresAt: string }

const auth = useTenantAuth()
const toast = useApiToast()
const entitlements = useEntitlements()
const jobs = ref<Job[]>([])
const today = localTodayKey()
const form = reactive({ kind: 'attendance_records' as ExportKind, from: `${today.slice(0, 7)}-01`, to: today, year: Number(today.slice(0, 4)) })
const creating = ref(false)
const stepping = new Set<string>()

const kindOptions = computed(() => EXPORT_KINDS
  .filter(k => k !== 'payslips' || auth.hasAbility('payroll.read'))
  .map(k => ({ label: EXPORT_KIND_LABELS[k], value: k as string })))
const yearOptions = [form.year - 1, form.year].map(y => ({ label: String(y), value: y }))
const needsRange = computed(() => EXPORT_KINDS_WITH_RANGE.includes(form.kind))
const statusLabel: Record<Job['status'], string> = { queued: 'Antre', running: 'Diproses', completed: 'Selesai', failed: 'Gagal' }
const statusColor: Record<Job['status'], 'neutral' | 'info' | 'success' | 'error'> = { queued: 'neutral', running: 'info', completed: 'success', failed: 'error' }

async function load() {
  jobs.value = (await apiFetch<{ items: Job[] }>('/api/app/exports')).items
  for (const job of jobs.value) if (job.status === 'queued' || job.status === 'running') void drive(job.id)
}

/** Jalankan langkah berulang sampai selesai (satu loop per pekerjaan). */
async function drive(id: string) {
  if (stepping.has(id)) return
  stepping.add(id)
  try {
    for (let i = 0; i < 500; i++) {
      const job = await apiFetch<Job>(`/api/app/exports/${id}/step`, { method: 'POST' })
      jobs.value = jobs.value.map(j => j.id === id ? job : j)
      if (job.status === 'completed' || job.status === 'failed') break
    }
  } catch (error) {
    toast.error(error)
  } finally {
    stepping.delete(id)
  }
}

async function create() {
  if (!entitlements.can('export')) return entitlements.upgradeRequired('export')
  creating.value = true
  try {
    const body = { kind: form.kind, ...(needsRange.value ? { from: form.from, to: form.to } : {}), ...(form.kind === 'payslips' ? { year: form.year } : {}) }
    const job = await apiFetch<Job>('/api/app/exports', { method: 'POST', body })
    jobs.value = [job, ...jobs.value]
    void drive(job.id)
  } catch (error) {
    toast.error(error)
  } finally {
    creating.value = false
  }
}

async function download(job: Job) {
  try {
    const { url } = await apiFetch<{ url: string }>(`/api/app/exports/${job.id}/download`)
    window.location.assign(url)
  } catch (error) {
    toast.error(error)
  }
}

onMounted(() => load().catch(toast.error))
</script>

<template>
  <div class="space-y-4">
    <UCard>
      <form
        class="flex flex-wrap items-end gap-3"
        @submit.prevent="create"
      >
        <UFormField label="Jenis ekspor">
          <USelect
            v-model="form.kind"
            :items="kindOptions"
            class="w-64"
          />
        </UFormField>
        <template v-if="needsRange">
          <UFormField label="Dari">
            <UInput
              v-model="form.from"
              type="date"
              class="w-44"
            />
          </UFormField>
          <UFormField label="Sampai">
            <UInput
              v-model="form.to"
              type="date"
              class="w-44"
            />
          </UFormField>
        </template>
        <UFormField
          v-if="form.kind === 'payslips'"
          label="Tahun"
        >
          <USelect
            v-model="form.year"
            :items="yearOptions"
            class="w-32"
          />
        </UFormField>
        <UButton
          type="submit"
          label="Buat ekspor"
          icon="i-lucide-file-down"
          :loading="creating"
          :trailing-icon="entitlements.can('export') ? undefined : 'i-lucide-lock'"
        />
      </form>
      <p class="mt-3 text-xs text-muted">
        Ekspor besar diproses bertahap di latar. Anda boleh meninggalkan halaman; berkas tersedia 24 jam lalu dihapus otomatis.
      </p>
    </UCard>

    <p
      v-if="!jobs.length"
      class="py-8 text-center text-sm text-muted"
    >
      Belum ada ekspor.
    </p>
    <UCard
      v-else
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <ul class="divide-y divide-default">
        <li
          v-for="job in jobs"
          :key="job.id"
          class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
        >
          <div class="min-w-0 flex-1">
            <p class="font-medium">
              {{ job.kindLabel }}
            </p>
            <p class="text-xs text-muted">
              {{ formatDateShort(job.createdAt.slice(0, 10)) }} · {{ job.rowCount.toLocaleString('id-ID') }} baris
              <span v-if="job.error"> · {{ job.error }}</span>
            </p>
          </div>
          <UBadge
            :label="statusLabel[job.status]"
            :color="statusColor[job.status]"
            variant="subtle"
          />
          <UButton
            v-if="job.ready"
            label="Unduh"
            icon="i-lucide-download"
            size="xs"
            variant="outline"
            @click="download(job)"
          />
        </li>
      </ul>
    </UCard>
  </div>
</template>
