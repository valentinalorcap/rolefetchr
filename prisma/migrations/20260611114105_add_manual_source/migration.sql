-- AlterEnum
ALTER TYPE "Source" ADD VALUE 'MANUAL';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "sourceLabel" TEXT;
