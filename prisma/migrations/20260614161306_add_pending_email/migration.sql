-- CreateTable
CREATE TABLE "PendingEmail" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT,
    "html" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PendingEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingEmail_processedAt_idx" ON "PendingEmail"("processedAt");
