-- CreateEnum
CREATE TYPE "StorageVisibility" AS ENUM ('public', 'private');

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "geofenceRadiusMeters" INTEGER,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6);

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "deleteRequestReason" TEXT,
ADD COLUMN     "leavePolicy" JSONB,
ADD COLUMN     "workCalendar" JSONB;

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "uploadedById" TEXT,
    "audience" "AuthAudience" NOT NULL,
    "visibility" "StorageVisibility" NOT NULL DEFAULT 'public',
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "originalName" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_path_key" ON "stored_files"("path");

-- CreateIndex
CREATE INDEX "stored_files_tenantId_deletedAt_idx" ON "stored_files"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "stored_files_createdAt_idx" ON "stored_files"("createdAt");

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

