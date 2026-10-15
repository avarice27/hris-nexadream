<script setup lang="ts">
// Siaran terjadwal ke pengguna perusahaan (bel di aplikasi). Dikirim oleh cron harian/berkala.
definePageMeta({ layout: 'admin' })
useHead({ title: 'Notifikasi terjadwal' })

interface Row { id: string, title: string, body: string, audience: string, actionUrl: string | null, scheduledFor: string, status: string, sentAt: string | null, recipientCount: number, error: string | null }
const auth = usePlatformAuth()
const toast = useToast()
const { confirm } = useConfirmDialog()
const list = useServerList<Row>('/api/admin/scheduled-notifications')
const canWrite = computed(() => auth.hasPermission('scheduled-notifications.write'))
const AUDIENCE_LABELS: Record<string, string> = { tenant_admins: 'Pemilik & Admin HR', tenant_team: 'Pemilik, Admin HR & atasan', all_tenant_users: 'Semua pengguna perusahaan' }
const STATUS: Record<string, { label: string, color: 'neutral' | 'info' | 'success' | 'error' }> = { scheduled: { label: 'Terjadwal', color: 'info' }, sending: { label: 'Mengirim', color: 'info' }, sent: { label: 'Terkirim', color: 'success' }, failed: { label: 'Gagal', color: 'error' } }
const audienceOptions = Object.entries(AUDIENCE_LABELS).map(([value, label]) => ({ label, value }))

const open = ref(false)
const formError = ref('')
const form = reactive({ title: '', body: '', audience: 'tenant_admins', actionUrl: '', date: '', time: '09:00' })
function openCreate() {
  const d = new Date(Date.now() + 86400_000)
  Object.assign(form, { title: '', body: '', audience: 'tenant_admins', actionUrl: '', date: d.toISOString().slice(0, 10), time: '09:00' })
  formError.value = ''
  open.value = true
}
async function save() {
  formError.value = ''
  try {
    // Waktu diisi dalam WIB (UTC+7).
    const scheduledFor = new Date(`${form.date}T${form.time}:00+07:00`).toISOString()
    await apiFetch('/api/admin/scheduled-notifications', { method: 'POST', body: { title: form.title, body: form.body, audience: form.audience, actionUrl: form.actionUrl || null, scheduledFor } })
    open.value = false
    toast.add({ title: 'Siaran dijadwalkan', color: 'success', icon: 'i-lucide-check' })
    await list.refresh()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  }
}
async function cancel(r: Row) {
  if (!await confirm({ title: `Batalkan "${r.title}"?`, confirmLabel: 'Batalkan siaran', color: 'error' })) return
  try {
    await apiFetch(`/api/admin/scheduled-notifications/${r.id}`, { method: 'DELETE' })
    await list.refresh()
  } catch (error) {
    toast.add({ title: extractErrorMessage(error), color: 'error' })
  }
}
</script>

<template>
  <PagePanel title="Notifikasi terjadwal">
    <template #actions>
      <UButton
        v-if="canWrite"
        label="Siaran baru"
        icon="i-lucide-plus"
        @click="openCreate"
      />
    </template>
    <div class="space-y-4">
      <UAlert
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        title="Siaran tampil di bel notifikasi pengguna perusahaan."
        description="Dikirim oleh job terjadwal (cron) pada atau setelah waktu yang dipilih. Notifikasi push menyusul setelah FCM dikonfigurasi."
      />
      <ListState
        :status="list.status.value"
        :error="list.errorMessage.value"
        :empty="!list.items.value.length"
        empty-text="Belum ada siaran."
        @retry="list.refresh"
      >
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="r in list.items.value"
              :key="r.id"
              class="flex flex-wrap items-start gap-3 px-4 py-3 text-sm"
            >
              <div class="min-w-0 flex-1">
                <p class="font-medium">
                  {{ r.title }}
                </p>
                <p class="text-muted">
                  {{ r.body }}
                </p>
                <p class="mt-1 text-xs text-muted">
                  {{ AUDIENCE_LABELS[r.audience] ?? r.audience }} · {{ formatDateTimeId(r.scheduledFor) }} WIB<span v-if="r.sentAt"> · {{ r.recipientCount }} penerima</span><span
                    v-if="r.error"
                    class="text-error"
                  > · {{ r.error }}</span>
                </p>
              </div>
              <UBadge
                :label="STATUS[r.status]?.label ?? r.status"
                :color="STATUS[r.status]?.color ?? 'neutral'"
                variant="subtle"
              />
              <UButton
                v-if="canWrite && r.status === 'scheduled'"
                label="Batalkan"
                size="xs"
                variant="ghost"
                color="error"
                @click="cancel(r)"
              />
            </li>
          </ul>
        </UCard>
      </ListState>
    </div>
    <UModal
      v-model:open="open"
      title="Siaran baru"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />
          <UFormField label="Judul">
            <UInput
              v-model="form.title"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Isi">
            <UTextarea
              v-model="form.body"
              :rows="3"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Penerima">
            <USelect
              v-model="form.audience"
              :items="audienceOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Tautan (opsional)"
            hint="Path aplikasi, mis. /app/billing"
          >
            <UInput
              v-model="form.actionUrl"
              class="w-full"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Tanggal">
              <UInput
                v-model="form.date"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Jam (WIB)">
              <UInput
                v-model="form.time"
                type="time"
                class="w-full"
              />
            </UFormField>
          </div>
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
            label="Jadwalkan"
            @click="save"
          />
        </div>
      </template>
    </UModal>
  </PagePanel>
</template>
