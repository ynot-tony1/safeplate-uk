-- AlterTable
-- id columns are STRING (Prisma's String scalar), but gen_random_uuid()
-- returns UUID — CockroachDB requires an explicit cast between the two.
ALTER TABLE "daily_metrics" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::STRING;

-- AlterTable
ALTER TABLE "ingestion_runs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::STRING;

-- AlterTable
ALTER TABLE "rating_changes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::STRING;
