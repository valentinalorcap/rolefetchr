-- CreateTable
CREATE TABLE "ScoringConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "rubric" TEXT NOT NULL,
    "candidateContext" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringConfig_pkey" PRIMARY KEY ("id")
);
