-- Fase 11: tabel domain HRIS (D20). Dibuat dengan prisma migrate diff.
-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('permanent', 'contract', 'internship', 'daily', 'freelance');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('active', 'probation', 'on_leave', 'inactive', 'terminated');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "ApprovalStepStatus" AS ENUM ('pending', 'approved', 'rejected', 'skipped', 'cancelled');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'late', 'absent', 'leave', 'holiday', 'off');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('self', 'admin', 'correction', 'auto_close', 'import');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('draft', 'approved', 'paid_recorded', 'void');

-- CreateEnum
CREATE TYPE "SalaryComponentKind" AS ENUM ('earning', 'deduction');

-- CreateEnum
CREATE TYPE "PerformanceCycleStatus" AS ENUM ('draft', 'active', 'closed');

-- CreateEnum
CREATE TYPE "PerformanceReviewStatus" AS ENUM ('pending', 'self_submitted', 'completed');

-- CreateTable
CREATE TABLE "tenant_hr_settings" (
    "tenantId" TEXT NOT NULL,
    "approvalChains" JSONB,
    "attendanceSelfieRequired" BOOLEAN NOT NULL DEFAULT false,
    "attendanceGeofenceEnforced" BOOLEAN NOT NULL DEFAULT false,
    "autoCloseAfterHours" INTEGER NOT NULL DEFAULT 6,
    "bpjsJkkRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 0.24,
    "payslipVisibleOnApproval" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_hr_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "tenantId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("tenantId","prefix","period")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "isCollectiveLeave" BOOLEAN NOT NULL DEFAULT false,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "gender" "Gender",
    "birthPlace" TEXT,
    "birthDate" DATE,
    "religion" TEXT,
    "maritalStatus" TEXT,
    "ptkpStatus" TEXT NOT NULL DEFAULT 'TK0',
    "address" TEXT,
    "photoUrl" TEXT,
    "joinDate" DATE NOT NULL,
    "probationEndDate" DATE,
    "contractEndDate" DATE,
    "endDate" DATE,
    "terminationReason" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'permanent',
    "status" "EmploymentStatus" NOT NULL DEFAULT 'active',
    "departmentId" TEXT,
    "positionId" TEXT,
    "managerId" TEXT,
    "shiftId" TEXT,
    "tenantUserId" TEXT,
    "nikEncrypted" TEXT,
    "npwpEncrypted" TEXT,
    "bpjsKesehatanNumberEncrypted" TEXT,
    "bpjsKetenagakerjaanNumberEncrypted" TEXT,
    "bankName" TEXT,
    "bankAccountNumberEncrypted" TEXT,
    "bankAccountName" TEXT,
    "bpjsKesehatanEnrolled" BOOLEAN NOT NULL DEFAULT true,
    "bpjsKetenagakerjaanEnrolled" BOOLEAN NOT NULL DEFAULT true,
    "pensionEnrolled" BOOLEAN NOT NULL DEFAULT true,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRelation" TEXT,
    "importBatchId" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "branchId" TEXT NOT NULL,
    "departmentId" TEXT,
    "positionId" TEXT,
    "managerId" TEXT,
    "employmentType" "EmploymentType" NOT NULL,
    "status" "EmploymentStatus" NOT NULL,
    "branchName" TEXT,
    "departmentName" TEXT,
    "positionName" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_family" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "birthDate" DATE,
    "nikEncrypted" TEXT,
    "isDependent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salaries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "dataEncrypted" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_salaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "lateToleranceMinutes" INTEGER NOT NULL DEFAULT 0,
    "workingDays" INTEGER[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shiftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "shiftId" TEXT,
    "scheduledStartAt" TIMESTAMP(3),
    "scheduledEndAt" TIMESTAMP(3),
    "clockInAt" TIMESTAMP(3),
    "clockOutAt" TIMESTAMP(3),
    "clockInLatitude" DECIMAL(9,6),
    "clockInLongitude" DECIMAL(9,6),
    "clockInAccuracy" INTEGER,
    "clockInDistanceMeters" INTEGER,
    "clockOutLatitude" DECIMAL(9,6),
    "clockOutLongitude" DECIMAL(9,6),
    "clockInPhotoFileId" TEXT,
    "clockOutPhotoFileId" TEXT,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'present',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "source" "AttendanceSource" NOT NULL DEFAULT 'self',
    "note" TEXT,
    "autoClosedAt" TIMESTAMP(3),
    "correctedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "attendanceRecordId" TEXT,
    "requestedClockIn" TIMESTAMP(3),
    "requestedClockOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "approverType" TEXT NOT NULL,
    "approverEmployeeId" TEXT,
    "status" "ApprovalStepStatus" NOT NULL DEFAULT 'pending',
    "decidedByUserId" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "annualDays" DECIMAL(5,1),
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,
    "eligibleAfterMonths" INTEGER NOT NULL DEFAULT 0,
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT true,
    "genderRestriction" "Gender",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_ledger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(5,1) NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "days" DECIMAL(5,1) NOT NULL,
    "reason" TEXT,
    "attachmentFileId" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "dayType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "payrollRunId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "expenseDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "approvedAmount" DECIMAL(14,2),
    "description" TEXT NOT NULL,
    "receiptFileId" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "payrollRunId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reimbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_components" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SalaryComponentKind" NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "bpjsBase" BOOLEAN NOT NULL DEFAULT false,
    "thrBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "branchId" TEXT,
    "includeThr" BOOLEAN NOT NULL DEFAULT false,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'draft',
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "calculatedCount" INTEGER NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalPph21" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalEmployerCost" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "paidRecordedAt" TIMESTAMP(3),
    "paidRecordedById" TEXT,
    "paidDate" DATE,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "replacesRunId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "departmentName" TEXT,
    "positionName" TEXT,
    "dataEncrypted" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "expiresAt" DATE,
    "visibleToEmployee" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_cycles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "PerformanceCycleStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewerEmployeeId" TEXT,
    "status" "PerformanceReviewStatus" NOT NULL DEFAULT 'pending',
    "goals" JSONB NOT NULL,
    "selfNote" TEXT,
    "managerNote" TEXT,
    "finalScore" DECIMAL(4,2),
    "selfSubmittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_data" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "data" JSONB NOT NULL,
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "departments_tenantId_idx" ON "departments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_tenantId_name_key" ON "departments"("tenantId", "name");

-- CreateIndex
CREATE INDEX "positions_tenantId_idx" ON "positions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "positions_tenantId_name_key" ON "positions"("tenantId", "name");

-- CreateIndex
CREATE INDEX "holidays_tenantId_date_idx" ON "holidays"("tenantId", "date");

-- CreateIndex
CREATE INDEX "employees_tenantId_status_idx" ON "employees"("tenantId", "status");

-- CreateIndex
CREATE INDEX "employees_tenantId_branchId_idx" ON "employees"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "employees_managerId_idx" ON "employees"("managerId");

-- CreateIndex
CREATE INDEX "employees_tenantId_createdAt_idx" ON "employees"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenantId_employeeNumber_key" ON "employees"("tenantId", "employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenantId_tenantUserId_key" ON "employees"("tenantId", "tenantUserId");

-- CreateIndex
CREATE INDEX "employment_history_employeeId_effectiveFrom_idx" ON "employment_history"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "employment_history_tenantId_idx" ON "employment_history"("tenantId");

-- CreateIndex
CREATE INDEX "employee_family_employeeId_idx" ON "employee_family"("employeeId");

-- CreateIndex
CREATE INDEX "employee_family_tenantId_idx" ON "employee_family"("tenantId");

-- CreateIndex
CREATE INDEX "employee_salaries_employeeId_effectiveFrom_idx" ON "employee_salaries"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "employee_salaries_tenantId_idx" ON "employee_salaries"("tenantId");

-- CreateIndex
CREATE INDEX "shifts_tenantId_idx" ON "shifts"("tenantId");

-- CreateIndex
CREATE INDEX "shift_assignments_tenantId_date_idx" ON "shift_assignments"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignments_employeeId_date_key" ON "shift_assignments"("employeeId", "date");

-- CreateIndex
CREATE INDEX "attendance_records_tenantId_workDate_idx" ON "attendance_records"("tenantId", "workDate");

-- CreateIndex
CREATE INDEX "attendance_records_tenantId_branchId_workDate_idx" ON "attendance_records"("tenantId", "branchId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_employeeId_workDate_key" ON "attendance_records"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "attendance_corrections_tenantId_status_idx" ON "attendance_corrections"("tenantId", "status");

-- CreateIndex
CREATE INDEX "attendance_corrections_employeeId_idx" ON "attendance_corrections"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_corrections_tenantId_code_key" ON "attendance_corrections"("tenantId", "code");

-- CreateIndex
CREATE INDEX "approval_steps_tenantId_status_idx" ON "approval_steps"("tenantId", "status");

-- CreateIndex
CREATE INDEX "approval_steps_approverEmployeeId_status_idx" ON "approval_steps"("approverEmployeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_subjectType_subjectId_stepOrder_key" ON "approval_steps"("subjectType", "subjectId", "stepOrder");

-- CreateIndex
CREATE INDEX "leave_types_tenantId_idx" ON "leave_types"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_tenantId_code_key" ON "leave_types"("tenantId", "code");

-- CreateIndex
CREATE INDEX "leave_ledger_employeeId_leaveTypeId_year_idx" ON "leave_ledger"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "leave_ledger_tenantId_idx" ON "leave_ledger"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_ledger_sourceId_reason_key" ON "leave_ledger"("sourceId", "reason");

-- CreateIndex
CREATE INDEX "leave_requests_tenantId_status_idx" ON "leave_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_startDate_idx" ON "leave_requests"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "leave_requests_tenantId_createdAt_idx" ON "leave_requests"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_tenantId_code_key" ON "leave_requests"("tenantId", "code");

-- CreateIndex
CREATE INDEX "overtime_requests_tenantId_status_idx" ON "overtime_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "overtime_requests_employeeId_workDate_idx" ON "overtime_requests"("employeeId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_requests_tenantId_code_key" ON "overtime_requests"("tenantId", "code");

-- CreateIndex
CREATE INDEX "reimbursements_tenantId_status_idx" ON "reimbursements"("tenantId", "status");

-- CreateIndex
CREATE INDEX "reimbursements_employeeId_expenseDate_idx" ON "reimbursements"("employeeId", "expenseDate");

-- CreateIndex
CREATE UNIQUE INDEX "reimbursements_tenantId_code_key" ON "reimbursements"("tenantId", "code");

-- CreateIndex
CREATE INDEX "salary_components_tenantId_idx" ON "salary_components"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_components_tenantId_code_key" ON "salary_components"("tenantId", "code");

-- CreateIndex
CREATE INDEX "payroll_runs_tenantId_periodYear_periodMonth_idx" ON "payroll_runs"("tenantId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "payroll_runs_tenantId_status_idx" ON "payroll_runs"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenantId_code_key" ON "payroll_runs"("tenantId", "code");

-- CreateIndex
CREATE INDEX "payslips_employeeId_idx" ON "payslips"("employeeId");

-- CreateIndex
CREATE INDEX "payslips_tenantId_idx" ON "payslips"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_runId_employeeId_key" ON "payslips"("runId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_tenantId_code_key" ON "payslips"("tenantId", "code");

-- CreateIndex
CREATE INDEX "employee_documents_tenantId_deletedAt_idx" ON "employee_documents"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "employee_documents_employeeId_idx" ON "employee_documents"("employeeId");

-- CreateIndex
CREATE INDEX "employee_documents_tenantId_expiresAt_idx" ON "employee_documents"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "performance_cycles_tenantId_idx" ON "performance_cycles"("tenantId");

-- CreateIndex
CREATE INDEX "performance_reviews_tenantId_idx" ON "performance_reviews"("tenantId");

-- CreateIndex
CREATE INDEX "performance_reviews_reviewerEmployeeId_idx" ON "performance_reviews"("reviewerEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "performance_reviews_cycleId_employeeId_key" ON "performance_reviews"("cycleId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "reference_data_key_effectiveFrom_key" ON "reference_data"("key", "effectiveFrom");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_resetAt_idx" ON "rate_limit_buckets"("resetAt");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_history" ADD CONSTRAINT "employment_history_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_family" ADD CONSTRAINT "employee_family_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "performance_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Satu run payroll aktif (bukan void) per periode per kantor; NULL = semua kantor.
CREATE UNIQUE INDEX "payroll_runs_active_period_branch_key" ON "payroll_runs" ("tenantId", "periodYear", "periodMonth", "branchId") WHERE "status" <> 'void' AND "branchId" IS NOT NULL;
CREATE UNIQUE INDEX "payroll_runs_active_period_all_key" ON "payroll_runs" ("tenantId", "periodYear", "periodMonth") WHERE "status" <> 'void' AND "branchId" IS NULL;
