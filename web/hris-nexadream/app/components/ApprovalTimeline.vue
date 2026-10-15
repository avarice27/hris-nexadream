<script setup lang="ts">
import { APPROVAL_STEP_STATUS_META, APPROVER_TYPE_LABELS, type ApproverType } from '#shared/utils/hr'
import type { ApprovalStepView } from '~/types/hr'

defineProps<{ steps: ApprovalStepView[] }>()
const icon = (status: string) => ({ approved: 'i-lucide-circle-check', rejected: 'i-lucide-circle-x', pending: 'i-lucide-circle-dashed' } as Record<string, string>)[status] ?? 'i-lucide-circle-minus'
const color = (status: string) => ({ approved: 'text-success', rejected: 'text-error', pending: 'text-warning' } as Record<string, string>)[status] ?? 'text-dimmed'
</script>

<template>
  <ol class="space-y-2 text-sm">
    <li
      v-for="step in steps"
      :key="step.order"
      class="flex gap-2"
    >
      <UIcon
        :name="icon(step.status)"
        class="mt-0.5 size-4 shrink-0"
        :class="color(step.status)"
      />
      <div class="min-w-0">
        <p>
          <span class="font-medium">{{ APPROVER_TYPE_LABELS[step.approverType as ApproverType] ?? step.approverType }}</span>
          <span
            v-if="step.approverName"
            class="text-muted"
          > · {{ step.approverName }}</span>
          <StatusBadge
            :map="APPROVAL_STEP_STATUS_META"
            :value="step.status"
            size="xs"
            class="ml-2"
          />
        </p>
        <p
          v-if="step.decidedByName"
          class="text-xs text-muted"
        >
          {{ step.decidedByName }} · {{ formatDateTimeId(step.decidedAt) }}
        </p>
        <p
          v-if="step.note"
          class="text-xs text-muted italic"
        >
          “{{ step.note }}”
        </p>
      </div>
    </li>
  </ol>
</template>
