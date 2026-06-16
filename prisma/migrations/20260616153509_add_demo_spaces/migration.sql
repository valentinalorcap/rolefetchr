-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "demoCode" TEXT;

-- CreateTable
CREATE TABLE "DemoSpace" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoSpace_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "Job_demoCode_idx" ON "Job"("demoCode");
