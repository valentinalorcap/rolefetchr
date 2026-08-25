-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "workMode" "WorkMode" NOT NULL DEFAULT 'REMOTE';
