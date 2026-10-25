-- CreateEnum
CREATE TYPE "Engagement" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "engagement" "Engagement";

-- CreateIndex
CREATE INDEX "Job_engagement_idx" ON "Job"("engagement");
