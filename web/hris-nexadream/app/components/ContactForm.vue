<script setup lang="ts">
// Formulir kontak publik → POST /api/contact. Field `website` adalah honeypot:
// tersembunyi dari manusia (dan pembaca layar), bot yang mengisinya diterima diam-diam lalu dibuang.
const form = reactive({ name: '', email: '', phone: '', subject: '', message: '', website: '' })
const submitting = ref(false)
const sent = ref(false)
const errorMessage = ref('')

async function submit() {
  errorMessage.value = ''
  submitting.value = true
  try {
    // apiFetch: menghindari inferensi tipe rute Nitro yang terlalu dalam pada $fetch.
    await apiFetch<{ success: boolean }>('/api/contact', {
      method: 'POST',
      body: { ...form, phone: form.phone || undefined, subject: form.subject || undefined }
    })
    sent.value = true
    Object.assign(form, { name: '', email: '', phone: '', subject: '', message: '', website: '' })
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UCard>
    <div
      v-if="sent"
      class="flex flex-col items-center gap-3 py-8 text-center"
      role="status"
    >
      <span class="inline-flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
        <UIcon
          name="i-lucide-check"
          class="size-6"
        />
      </span>
      <p class="font-semibold text-highlighted">
        Pesan terkirim
      </p>
      <p class="max-w-sm text-sm text-muted">
        Terima kasih. Tim kami akan membalas ke email Anda secepatnya pada hari kerja.
      </p>
      <UButton
        label="Kirim pesan lain"
        variant="ghost"
        @click="sent = false"
      />
    </div>
    <form
      v-else
      class="space-y-4"
      @submit.prevent="submit"
    >
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
      />
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          label="Nama"
          required
        >
          <UInput
            v-model="form.name"
            autocomplete="name"
            class="w-full"
            required
          />
        </UFormField>
        <UFormField
          label="Email kantor"
          required
        >
          <UInput
            v-model="form.email"
            type="email"
            autocomplete="email"
            class="w-full"
            required
          />
        </UFormField>
        <UFormField
          label="Nomor HP / WhatsApp"
          hint="Opsional"
        >
          <UInput
            v-model="form.phone"
            type="tel"
            autocomplete="tel"
            placeholder="08xx"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Perihal"
          hint="Opsional"
        >
          <UInput
            v-model="form.subject"
            placeholder="Mis. demo paket Enterprise"
            class="w-full"
          />
        </UFormField>
      </div>
      <UFormField
        label="Pesan"
        required
      >
        <UTextarea
          v-model="form.message"
          :rows="5"
          placeholder="Ceritakan kebutuhan perusahaan Anda, misalnya jumlah karyawan dan kantor."
          class="w-full"
          required
        />
      </UFormField>
      <!-- Honeypot: disembunyikan dari tampilan, tab, dan pembaca layar -->
      <div
        class="absolute -left-[9999px] h-px w-px overflow-hidden"
        aria-hidden="true"
      >
        <label for="contact-website">Website</label>
        <input
          id="contact-website"
          v-model="form.website"
          type="text"
          name="website"
          tabindex="-1"
          autocomplete="off"
        >
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-muted">
          Dengan mengirim, Anda menyetujui <NuxtLink
            to="/privacy"
            class="underline hover:text-default"
          >Kebijakan Privasi</NuxtLink> kami.
        </p>
        <UButton
          type="submit"
          label="Kirim pesan"
          icon="i-lucide-send"
          :loading="submitting"
        />
      </div>
    </form>
  </UCard>
</template>
