import type { PayslipData } from '#shared/utils/payroll-rules'

// Bentuk respons API modul HR yang dipakai lintas komponen.

export interface ApprovalStepView {
  order: number
  approverType: string
  approverName: string | null
  status: string
  decidedByName: string | null
  decidedAt: string | null
  note: string | null
}

export interface PayslipDetail {
  id: string
  code: string
  runStatus: string
  periodLabel: string
  company: { name: string, logoUrl: string | null }
  employee: { name: string, number: string, department: string | null, position: string | null, joinDate: string, npwp: string | null, bank: string | null }
  paidDate: string | null
  data: Omit<PayslipData, 'sources'> | null
}

export interface ReviewView {
  id: string
  cycle: { name: string, periodStart: string, periodEnd: string, status: string }
  employee: { id: string, fullName: string, employeeNumber: string }
  reviewerName: string | null
  status: string
  goals: Array<{ title: string, weight: number, selfScore?: number | null, score?: number | null, note?: string | null }>
  selfNote: string | null
  managerNote: string | null
  finalScore: number | null
  canEditGoals: boolean
  canSelfReview: boolean
  canFinalize: boolean
}
