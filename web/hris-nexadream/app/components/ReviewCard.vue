<script setup lang="ts">
import { PERFORMANCE_REVIEW_STATUS_META } from '#shared/utils/hr'
import type { ReviewView } from '~/types/hr'

// Satu penilaian kinerja: target berbobot, skor diri, skor atasan. Dipakai ESS & konsol.
const props = defineProps<{ review: ReviewView, mode: 'self' | 'manager' }>()
const emit = defineEmits<{ saved: [] }>()
const toast = useApiToast()
const saving = ref(false)
const scores = ref<number[]>(props.review.goals.map(g => (props.mode === 'self' ? g.selfScore : g.score) ?? 3))
const note = ref((props.mode === 'self' ? props.review.selfNote : props.review.managerNote) ?? '')
const goals = ref(props.review.goals.map(g => ({ title: g.title, weight: g.weight })))
const editing = computed(() => (props.mode === 'self' ? props.review.canSelfReview : props.review.canFinalize))

async function submit() {
  saving.value = true
  try {
    const path = props.mode === 'self' ? `/api/app/me/performance/${props.review.id}/self` : `/api/app/performance/reviews/${props.review.id}/finalize`
    await apiFetch(path, { method: 'POST', body: { scores: scores.value, note: note.value || null } })
    toast.success(props.mode === 'self' ? 'Penilaian diri terkirim' : 'Penilaian diselesaikan')
    emit('saved')
  } catch (error) {
    toast.error(error)
  } finally {
    saving.value = false
  }
}
async function saveGoals() {
  saving.value = true
  try {
    await apiFetch(`/api/app/performance/reviews/${props.review.id}/goals`, { method: 'POST', body: { goals: goals.value.filter(g => g.title.trim()) } })
    toast.success('Target disimpan')
    emit('saved')
  } catch (error) {
    toast.error(error)
  } finally {
    saving.value = false
  }
}
const weightTotal = computed(() => goals.value.reduce((s, g) => s + (Number(g.weight) || 0), 0))
</script>

<template>
  <div class="space-y-4 text-sm">
    <div class="flex flex-wrap items-center gap-2">
      <p class="font-semibold">
        {{ review.cycle.name }}
      </p>
      <StatusBadge
        :map="PERFORMANCE_REVIEW_STATUS_META"
        :value="review.status"
      />
      <span
        v-if="review.finalScore !== null"
        class="ml-auto text-lg font-semibold tabular"
      >{{ review.finalScore }} / 5</span>
    </div>
    <p class="text-xs text-muted">
      {{ formatDateShort(review.cycle.periodStart) }} – {{ formatDateShort(review.cycle.periodEnd) }} · Penilai: {{ review.reviewerName ?? 'Admin HR' }}
    </p>

    <!-- Penilai menyusun target sebelum karyawan menilai diri -->
    <div
      v-if="mode === 'manager' && review.canEditGoals"
      class="space-y-2"
    >
      <div
        v-for="(g, i) in goals"
        :key="i"
        class="flex gap-2"
      >
        <UInput
          v-model="g.title"
          placeholder="Target"
          class="flex-1"
        />
        <UInputNumber
          v-model="g.weight"
          :min="1"
          :max="100"
          class="w-28"
          aria-label="Bobot"
        />
        <UButton
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          aria-label="Hapus target"
          @click="goals.splice(i, 1)"
        />
      </div>
      <div class="flex items-center gap-2">
        <UButton
          label="Tambah target"
          icon="i-lucide-plus"
          size="xs"
          variant="outline"
          :disabled="goals.length >= 10"
          @click="goals.push({ title: '', weight: 10 })"
        />
        <span
          class="text-xs"
          :class="weightTotal === 100 ? 'text-muted' : 'text-warning'"
        >Total bobot {{ weightTotal }}%</span>
        <UButton
          label="Simpan target"
          size="xs"
          class="ml-auto"
          :loading="saving"
          @click="saveGoals"
        />
      </div>
    </div>

    <table
      v-else
      class="w-full"
    >
      <thead class="text-xs text-muted">
        <tr>
          <th class="py-1 text-left font-normal">
            Target
          </th>
          <th class="w-16 py-1 text-right font-normal">
            Bobot
          </th>
          <th class="w-20 py-1 text-right font-normal">
            Diri
          </th>
          <th class="w-20 py-1 text-right font-normal">
            Atasan
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-default">
        <tr
          v-for="(g, i) in review.goals"
          :key="i"
        >
          <td class="py-2">
            {{ g.title }}
          </td>
          <td class="py-2 text-right tabular">
            {{ g.weight }}%
          </td>
          <td class="py-2 text-right">
            <USelect
              v-if="mode === 'self' && editing"
              v-model="scores[i]"
              :items="[1, 2, 3, 4, 5]"
              size="xs"
              class="w-16"
            />
            <span v-else>{{ g.selfScore ?? '–' }}</span>
          </td>
          <td class="py-2 text-right">
            <USelect
              v-if="mode === 'manager' && editing"
              v-model="scores[i]"
              :items="[1, 2, 3, 4, 5]"
              size="xs"
              class="w-16"
            />
            <span v-else>{{ g.score ?? '–' }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p
      v-if="!review.goals.length && !(mode === 'manager' && review.canEditGoals)"
      class="text-muted"
    >
      Target belum disusun penilai.
    </p>

    <p
      v-if="review.selfNote && !(mode === 'self' && editing)"
      class="text-muted"
    >
      <span class="font-medium text-default">Catatan diri:</span> {{ review.selfNote }}
    </p>
    <p
      v-if="review.managerNote && !(mode === 'manager' && editing)"
      class="text-muted"
    >
      <span class="font-medium text-default">Catatan atasan:</span> {{ review.managerNote }}
    </p>
    <div
      v-if="editing && review.goals.length"
      class="space-y-2"
    >
      <UTextarea
        v-model="note"
        :rows="2"
        :placeholder="mode === 'self' ? 'Catatan pencapaian Anda' : 'Umpan balik untuk karyawan'"
        class="w-full"
      />
      <UButton
        :label="mode === 'self' ? 'Kirim penilaian diri' : 'Selesaikan penilaian'"
        :loading="saving"
        @click="submit"
      />
    </div>
  </div>
</template>
