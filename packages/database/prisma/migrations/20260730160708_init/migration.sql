-- This CockroachDB cluster defaults new tables to schema_locked = true
-- (a changefeed-performance optimization this project doesn't use), which
-- blocks the ADD CONSTRAINT (foreign key) statements below since FK
-- addition isn't one of the DDL operations CockroachDB can auto-unlock for.
-- Session-scoped, so it only affects this migration, not the cluster default.
SET create_table_with_schema_locked = false;

-- CreateEnum
CREATE TYPE "SchemeType" AS ENUM ('FHRS', 'FHIS');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "business_types" (
    "id" INT4 NOT NULL,
    "description" STRING NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_authorities" (
    "code" STRING NOT NULL,
    "name" STRING NOT NULL,
    "region_name" STRING,
    "scheme_type" "SchemeType" NOT NULL DEFAULT 'FHRS',
    "open_data_url" STRING,
    "last_extract_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_authorities_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "establishments" (
    "fhrs_id" STRING NOT NULL,
    "business_name" STRING NOT NULL,
    "normalised_name" STRING NOT NULL,
    "business_type_id" INT4,
    "business_type_name" STRING,
    "address_line_1" STRING,
    "address_line_2" STRING,
    "address_line_3" STRING,
    "address_line_4" STRING,
    "postcode" STRING,
    "postcode_prefix" STRING,
    "local_authority_code" STRING NOT NULL,
    "local_authority_name" STRING NOT NULL,
    "local_authority_web_site" STRING,
    "local_authority_email" STRING,
    "rating_value" STRING,
    "rating_key" STRING,
    "rating_date" DATE,
    "scheme_type" "SchemeType" NOT NULL,
    "new_rating_pending" BOOL NOT NULL DEFAULT false,
    "hygiene_score" INT4,
    "structural_score" INT4,
    "confidence_management_score" INT4,
    "longitude" FLOAT8,
    "latitude" FLOAT8,
    "source_extract_date" DATE NOT NULL,
    "is_active" BOOL NOT NULL DEFAULT true,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "establishments_pkey" PRIMARY KEY ("fhrs_id")
);

-- CreateTable
CREATE TABLE "rating_changes" (
    "id" STRING NOT NULL,
    "fhrs_id" STRING NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_rating_value" STRING,
    "new_rating_value" STRING,
    "previous_rating_date" DATE,
    "new_rating_date" DATE,
    "previous_new_rating_pending" BOOL,
    "new_new_rating_pending" BOOL,
    "previous_hygiene_score" INT4,
    "new_hygiene_score" INT4,
    "previous_structural_score" INT4,
    "new_structural_score" INT4,
    "previous_confidence_score" INT4,
    "new_confidence_score" INT4,
    "ingestion_run_id" STRING,

    CONSTRAINT "rating_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_runs" (
    "id" STRING NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'RUNNING',
    "source_extract_date" DATE,
    "local_authorities_checked" INT4 NOT NULL DEFAULT 0,
    "local_authorities_changed" INT4 NOT NULL DEFAULT 0,
    "rows_seen" INT4 NOT NULL DEFAULT 0,
    "rows_inserted" INT4 NOT NULL DEFAULT 0,
    "rows_updated" INT4 NOT NULL DEFAULT 0,
    "rating_changes_created" INT4 NOT NULL DEFAULT 0,
    "rows_rejected" INT4 NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "workflow_run_id" STRING,
    "git_sha" STRING,
    "error_summary" STRING(4000),

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_metrics" (
    "id" STRING NOT NULL,
    "metric_date" DATE NOT NULL,
    "scope" STRING NOT NULL,
    "local_authority_code" STRING,
    "total_establishments" INT4 NOT NULL DEFAULT 0,
    "rated_5_count" INT4 NOT NULL DEFAULT 0,
    "rated_0_to_2_count" INT4 NOT NULL DEFAULT 0,
    "awaiting_count" INT4 NOT NULL DEFAULT 0,
    "new_rating_pending_count" INT4 NOT NULL DEFAULT 0,
    "inspections_latest_month" INT4 NOT NULL DEFAULT 0,
    "participating_authorities" INT4 NOT NULL DEFAULT 0,
    "avg_days_since_inspection" FLOAT8,
    "business_type_mix" JSONB,
    "rating_distribution" JSONB,
    "inspections_by_month" JSONB,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "establishments_normalised_name_idx" ON "establishments"("normalised_name");

-- CreateIndex
CREATE INDEX "establishments_postcode_prefix_idx" ON "establishments"("postcode_prefix");

-- CreateIndex
CREATE INDEX "establishments_local_authority_code_idx" ON "establishments"("local_authority_code");

-- CreateIndex
CREATE INDEX "establishments_business_type_id_idx" ON "establishments"("business_type_id");

-- CreateIndex
CREATE INDEX "establishments_rating_key_idx" ON "establishments"("rating_key");

-- CreateIndex
CREATE INDEX "establishments_rating_date_idx" ON "establishments"("rating_date");

-- CreateIndex
CREATE INDEX "establishments_scheme_type_idx" ON "establishments"("scheme_type");

-- CreateIndex
CREATE INDEX "establishments_new_rating_pending_idx" ON "establishments"("new_rating_pending");

-- CreateIndex
CREATE INDEX "establishments_latitude_longitude_idx" ON "establishments"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "rating_changes_fhrs_id_idx" ON "rating_changes"("fhrs_id");

-- CreateIndex
CREATE INDEX "ingestion_runs_started_at_idx" ON "ingestion_runs"("started_at");

-- CreateIndex
CREATE INDEX "daily_metrics_scope_metric_date_idx" ON "daily_metrics"("scope", "metric_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_metrics_metric_date_scope_local_authority_code_key" ON "daily_metrics"("metric_date", "scope", "local_authority_code");

-- AddForeignKey
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_business_type_id_fkey" FOREIGN KEY ("business_type_id") REFERENCES "business_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_local_authority_code_fkey" FOREIGN KEY ("local_authority_code") REFERENCES "local_authorities"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_changes" ADD CONSTRAINT "rating_changes_fhrs_id_fkey" FOREIGN KEY ("fhrs_id") REFERENCES "establishments"("fhrs_id") ON DELETE RESTRICT ON UPDATE CASCADE;
