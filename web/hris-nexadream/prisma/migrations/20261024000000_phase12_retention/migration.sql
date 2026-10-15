-- Fase 12: penanda tahap purge retensi data perusahaan yang dihapus.
-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "dataPurgeStage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dataPurgedAt" TIMESTAMP(3);

