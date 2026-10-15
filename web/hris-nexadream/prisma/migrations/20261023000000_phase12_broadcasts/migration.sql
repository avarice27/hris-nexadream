-- Fase 12: audiens & penerima untuk siaran terjadwal (bel).
-- AlterTable
ALTER TABLE "scheduled_notifications" ADD COLUMN     "actionUrl" TEXT,
ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'tenant_admins',
ADD COLUMN     "recipientCount" INTEGER NOT NULL DEFAULT 0;

