-- Invoice langganan dengan PPN (D24), pekerjaan ekspor latar, dan metode pajak gross-up per karyawan.
-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "taxMethod" TEXT NOT NULL DEFAULT 'gross';

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "sellerNpwp" TEXT,
    "sellerAddress" TEXT,
    "sellerIsPkp" BOOLEAN NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerAddress" TEXT,
    "buyerNpwpEncrypted" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "total" INTEGER NOT NULL,
    "taxBase" INTEGER NOT NULL,
    "otherTaxBase" INTEGER NOT NULL,
    "vatRatePercent" DECIMAL(5,2) NOT NULL,
    "vat" INTEGER NOT NULL,
    "stampDutyApplies" BOOLEAN NOT NULL DEFAULT false,
    "taxInvoiceNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'queued',
    "cursor" TEXT,
    "partialCsv" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "fileId" TEXT,
    "error" TEXT,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_paymentId_key" ON "subscription_invoices"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_number_key" ON "subscription_invoices"("number");

-- CreateIndex
CREATE INDEX "subscription_invoices_tenantId_issuedAt_idx" ON "subscription_invoices"("tenantId", "issuedAt");

-- CreateIndex
CREATE INDEX "export_jobs_tenantId_createdAt_idx" ON "export_jobs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "export_jobs_expiresAt_idx" ON "export_jobs"("expiresAt");

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Nomor invoice global berurutan.
CREATE SEQUENCE IF NOT EXISTS "subscription_invoice_seq" START 1;

-- Pengaturan penagihan: PPN dihitung dari harga yang sudah termasuk pajak.
INSERT INTO "app_settings" ("key","value","group","type","label","isSecret","createdAt","updatedAt") VALUES
  ('billing.pkpRegistered','true','billing','boolean','Penjual berstatus PKP',false,(now() at time zone 'utc'),(now() at time zone 'utc')),
  ('billing.vatRatePercent','12','billing','number','Tarif PPN (%)',false,(now() at time zone 'utc'),(now() at time zone 'utc')),
  ('billing.sellerNpwp','','billing','string','NPWP penjual',false,(now() at time zone 'utc'),(now() at time zone 'utc'))
ON CONFLICT ("key") DO NOTHING;
DELETE FROM "app_settings" WHERE "key" = 'billing.invoiceTaxRatePercent';
