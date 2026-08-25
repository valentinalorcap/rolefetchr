-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "companyKey" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "techs" TEXT[];

-- CreateIndex
CREATE INDEX "Job_region_idx" ON "Job"("region");

-- CreateIndex
CREATE INDEX "Job_country_idx" ON "Job"("country");

-- CreateIndex
CREATE INDEX "Job_companyKey_idx" ON "Job"("companyKey");
