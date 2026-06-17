-- AlterTable
ALTER TABLE "DemoSpace" ADD COLUMN     "firstUsedAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "useCount" INTEGER NOT NULL DEFAULT 0;
