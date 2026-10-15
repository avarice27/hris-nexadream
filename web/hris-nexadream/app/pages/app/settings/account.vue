<script setup lang="ts">
import { TENANT_TOKEN_KEY } from '#shared/utils/auth-rules'
import { formatDateId } from '#shared/utils/format'

// Hak data pemilik: ekspor seluruh data dan permintaan penghapusan akun perusahaan.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Data & akun' })

interface AccountStatus { deleteRequestedAt: string | null, slaDays: number, financialRetentionYears: number }

const auth = useTenantAuth()
const toast = useApiToast()
const { confirm } = useConfirmDialog()

const account = ref<AccountStatus | null>(null)
const exporting = ref(false)
const reason = ref('')
const confirmed = ref(false)
const requesting = ref(false)

onMounted(async () => {
  try {
    account.value = await apiFetch<AccountStatus>('/api/app/account')
  } catch (error) {
    toast.error(error)
  }
})

/** Unduh lewat fetch biasa (token di header, bukan di URL). */
async function exportData() {
  exporting.value = true
  try {
    const response = await fetch('/api/app/account/export', {
      headers: { authorization: `Bearer ${localStorage.getItem(TENANT_TOKEN_KEY) ?? ''}` }
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw { data: body, statusCode: response.status }
    }
    const blob = await response.blob()
    const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'hrisnexadream-data.json'
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Ekspor data selesai diunduh')
  } catch (error) {
    toast.error(error)
  } finally {
    exporting.value = false
  }
}

async function requestDeletion() {
  const ok = await confirm({
    title: 'Kirim permintaan penghapusan?',
    description: `Tim kami akan memproses dalam ${account.value?.slaDays ?? 30} hari. Unduh ekspor data terlebih dahulu bila Anda masih membutuhkannya.`,
    confirmLabel: 'Kirim permintaan',
    color: 'error'
  })
  if (!ok) return
  requesting.value = true
  try {
    await apiFetch('/api/app/account/delete-request', { method: 'POST', body: { reason: reason.value || undefined, confirmation: true } })
    account.value = await apiFetch<AccountStatus>('/api/app/account')
    toast.success('Permintaan penghapusan terkirim')
  } catch (error) {
    toast.error(error)
  } finally {
    requesting.value = false
  }
}
</script>

<template>
  <PagePanel title="Pengaturan">
    <SettingsNav />

    <div class="max-w-2xl space-y-6">
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Ekspor data perusahaan
          </h2>
        </template>
        <p class="text-sm text-muted">
          Unduh seluruh data milik {{ auth.tenant.value?.name }} dalam format JSON: profil perusahaan, kantor, tim,
          langganan, pembayaran, dan notifikasi. NPWP disertakan tanpa samaran — simpan file ini dengan aman.
          Setiap ekspor dicatat di log aktivitas.
        </p>
        <template #footer>
          <UButton
            label="Unduh ekspor data"
            icon="i-lucide-download"
            :loading="exporting"
            @click="exportData"
          />
        </template>
      </UCard>

      <UCard :ui="{ root: 'ring-error/40' }">
        <template #header>
          <h2 class="font-semibold text-error">
            Hapus akun perusahaan
          </h2>
        </template>

        <UAlert
          v-if="account?.deleteRequestedAt"
          color="warning"
          variant="subtle"
          icon="i-lucide-hourglass"
          title="Permintaan penghapusan sedang diproses"
          :description="`Dikirim ${formatDateId(account.deleteRequestedAt, auth.displayTimezone.value)}. Kami akan menghubungi Anda dalam ${account.slaDays} hari.`"
        />
        <div
          v-else
          class="space-y-4 text-sm"
        >
          <p class="text-muted">
            Penghapusan bersifat permanen. Catatan penggajian, pajak, dan BPJS wajib disimpan sesuai ketentuan
            (sekitar {{ account?.financialRetentionYears ?? 10 }} tahun): data tersebut dibatasi aksesnya dan dihapus otomatis
            setelah masa simpan berakhir. Selengkapnya di <ULink
              to="/hapus-akun"
              class="text-primary"
            >halaman penghapusan akun</ULink>.
          </p>
          <UFormField label="Alasan (opsional)">
            <UTextarea
              v-model="reason"
              :rows="2"
              autoresize
              class="w-full"
            />
          </UFormField>
          <UCheckbox
            v-model="confirmed"
            label="Saya memahami bahwa seluruh data perusahaan akan dihapus."
          />
        </div>

        <template
          v-if="!account?.deleteRequestedAt"
          #footer
        >
          <UButton
            label="Minta penghapusan akun"
            color="error"
            icon="i-lucide-trash-2"
            :disabled="!confirmed"
            :loading="requesting"
            @click="requestDeletion"
          />
        </template>
      </UCard>
    </div>
  </PagePanel>
</template>
