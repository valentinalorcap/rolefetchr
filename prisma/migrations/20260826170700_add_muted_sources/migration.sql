-- CreateTable
CREATE TABLE "MutedSource" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutedSource_pkey" PRIMARY KEY ("key")
);

-- Seed: known repost bots (normalized keys per lib/normalize companyKey).
INSERT INTO "MutedSource" ("key", "label") VALUES
  ('hire feed', 'Hire Feed'),
  ('hired', 'Hired'),
  ('jobs ai', 'Jobs Ai'),
  ('remote zest jobs', 'remote zest jobs'),
  ('vacancy global pro', 'vacancy global pro'),
  ('remote spark', 'Remote Spark')
ON CONFLICT ("key") DO NOTHING;
