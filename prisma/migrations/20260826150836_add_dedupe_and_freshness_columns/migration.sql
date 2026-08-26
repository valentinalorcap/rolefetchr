-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "descriptionUnverified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Job_fingerprint_idx" ON "Job"("fingerprint");
