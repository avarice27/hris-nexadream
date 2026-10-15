<script setup lang="ts">
import type { LeavePolicyItem } from '#shared/utils/identifiers'

definePageMeta({ layout: 'tenant' })
useHead({ title: 'Jam kerja & cuti' })

const { settings, status, errorMessage, load, save } = useTenantSettings()
const toast = useApiToast()

const calendar = reactive({ workingDays: [1, 2, 3, 4, 5] as number[], startTime: '08:00', endTime: '17:00', breakMinutes: 60 })
const policy = ref<LeavePolicyItem[]>([])
const saving = ref(false)

function fill() {
  if (!settings.value) return
  if (settings.value.workCalendar) Object.assign(calendar, settings.value.workCalendar)
  policy.value = (settings.value.leavePolicy ?? []).map(item => ({ ...item }))
}

onMounted(async () => {
  await load(true)
  fill()
})

function addLeaveType() {
  policy.value.push({ code: `custom_${policy.value.length + 1}`, name: '', days: 1, eligibleAfterMonths: 0 })
}

function removeLeaveType(index: number) {
  policy.value.splice(index, 1)
}

async function onSave() {
  saving.value = true
  try {
    await save({ workCalendar: { ...calendar }, leavePolicy: policy.value })
    fill()
    toast.success('Jam kerja & kebijakan cuti disimpan')
  } catch (error) {
    toast.error(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PagePanel title="Pengaturan">
    <SettingsNav />
    <UAlert
      class="mb-4"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="Nilai di halaman ini adalah bawaan awal."
      description="Jam kerja aktual diatur di Shift & jadwal, dan jenis/jatah cuti di menu Cuti → Jenis cuti."
    />

    <USkeleton
      v-if="status === 'loading' && !settings"
      class="h-96 w-full max-w-3xl"
    />
    <UAlert
      v-else-if="status === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />

    <form
      v-else-if="settings"
      class="max-w-3xl space-y-8"
      @submit.prevent="onSave"
    >
      <section class="space-y-4">
        <div>
          <h2 class="font-semibold">
            Jam kerja bawaan
          </h2>
          <p class="text-sm text-muted">
            Dipakai sebagai jadwal awal absensi. Shift khusus diatur di modul Kehadiran.
          </p>
        </div>
        <UFormField label="Hari kerja">
          <WorkingDaysPicker v-model="calendar.workingDays" />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Jam masuk">
            <UInput
              v-model="calendar.startTime"
              type="time"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Jam pulang">
            <UInput
              v-model="calendar.endTime"
              type="time"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Istirahat (menit)">
            <UInputNumber
              v-model="calendar.breakMinutes"
              :min="0"
              :max="240"
              :step="15"
              class="w-full"
            />
          </UFormField>
        </div>
      </section>

      <section class="space-y-4">
        <div class="flex items-end justify-between gap-2">
          <div>
            <h2 class="font-semibold">
              Kebijakan cuti
            </h2>
            <p class="text-sm text-muted">
              Jatah hari kosong = tanpa batas tetap (mis. cuti sakit dengan surat dokter).
            </p>
          </div>
          <UButton
            label="Tambah jenis cuti"
            icon="i-lucide-plus"
            size="sm"
            variant="outline"
            @click="addLeaveType"
          />
        </div>

        <div class="space-y-3">
          <UCard
            v-for="(item, index) in policy"
            :key="index"
            :ui="{ body: 'p-3 sm:p-4' }"
          >
            <div class="grid gap-3 sm:grid-cols-[1fr_8rem_9rem_auto] sm:items-end">
              <UFormField label="Nama jenis cuti">
                <UInput
                  v-model="item.name"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Jatah (hari)">
                <UInputNumber
                  :model-value="item.days ?? undefined"
                  :min="0"
                  :max="365"
                  placeholder="Tanpa batas"
                  class="w-full"
                  @update:model-value="(v: number | null | undefined) => (item.days = v ?? null)"
                />
              </UFormField>
              <UFormField label="Berlaku setelah (bulan)">
                <UInputNumber
                  v-model="item.eligibleAfterMonths"
                  :min="0"
                  :max="120"
                  class="w-full"
                />
              </UFormField>
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                aria-label="Hapus jenis cuti"
                @click="removeLeaveType(index)"
              />
            </div>
          </UCard>
          <p
            v-if="!policy.length"
            class="text-sm text-muted"
          >
            Belum ada jenis cuti.
          </p>
        </div>
      </section>

      <UButton
        type="submit"
        label="Simpan"
        :loading="saving"
      />
    </form>
  </PagePanel>
</template>
