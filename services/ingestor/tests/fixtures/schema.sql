-- Disposable local test-DB DDL mirroring packages/database/prisma/schema.prisma.
-- Used only by this service's own integration-style tests, against a
-- separate database (food_hygiene_ingestor_test) so we never race the
-- web-app agent's Prisma migrations on the shared `food_hygiene` database.

CREATE TABLE IF NOT EXISTS business_types (
    id INT PRIMARY KEY,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_authorities (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    region_name TEXT,
    scheme_type TEXT NOT NULL DEFAULT 'FHRS' CHECK (scheme_type IN ('FHRS', 'FHIS')),
    open_data_url TEXT,
    last_extract_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS establishments (
    fhrs_id TEXT PRIMARY KEY,
    business_name TEXT NOT NULL,
    normalised_name TEXT NOT NULL,
    business_type_id INT REFERENCES business_types(id),
    business_type_name TEXT,
    address_line_1 TEXT,
    address_line_2 TEXT,
    address_line_3 TEXT,
    address_line_4 TEXT,
    postcode TEXT,
    postcode_prefix TEXT,
    local_authority_code TEXT NOT NULL REFERENCES local_authorities(code),
    local_authority_name TEXT NOT NULL,
    local_authority_web_site TEXT,
    local_authority_email TEXT,
    rating_value TEXT,
    rating_key TEXT,
    rating_date DATE,
    scheme_type TEXT NOT NULL CHECK (scheme_type IN ('FHRS', 'FHIS')),
    new_rating_pending BOOL NOT NULL DEFAULT false,
    hygiene_score INT,
    structural_score INT,
    confidence_management_score INT,
    longitude FLOAT8,
    latitude FLOAT8,
    source_extract_date DATE NOT NULL,
    is_active BOOL NOT NULL DEFAULT true,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_establishments_normalised_name ON establishments (normalised_name);
CREATE INDEX IF NOT EXISTS idx_establishments_postcode_prefix ON establishments (postcode_prefix);
CREATE INDEX IF NOT EXISTS idx_establishments_local_authority_code ON establishments (local_authority_code);
CREATE INDEX IF NOT EXISTS idx_establishments_business_type_id ON establishments (business_type_id);
CREATE INDEX IF NOT EXISTS idx_establishments_rating_key ON establishments (rating_key);
CREATE INDEX IF NOT EXISTS idx_establishments_rating_date ON establishments (rating_date);
CREATE INDEX IF NOT EXISTS idx_establishments_scheme_type ON establishments (scheme_type);
CREATE INDEX IF NOT EXISTS idx_establishments_new_rating_pending ON establishments (new_rating_pending);
CREATE INDEX IF NOT EXISTS idx_establishments_lat_lon ON establishments (latitude, longitude);

CREATE TABLE IF NOT EXISTS rating_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fhrs_id TEXT NOT NULL REFERENCES establishments(fhrs_id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    previous_rating_value TEXT,
    new_rating_value TEXT,
    previous_rating_date DATE,
    new_rating_date DATE,
    previous_new_rating_pending BOOL,
    new_new_rating_pending BOOL,
    previous_hygiene_score INT,
    new_hygiene_score INT,
    previous_structural_score INT,
    new_structural_score INT,
    previous_confidence_score INT,
    new_confidence_score INT,
    ingestion_run_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_rating_changes_fhrs_id ON rating_changes (fhrs_id);

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL')),
    source_extract_date DATE,
    local_authorities_checked INT NOT NULL DEFAULT 0,
    local_authorities_changed INT NOT NULL DEFAULT 0,
    rows_seen INT NOT NULL DEFAULT 0,
    rows_inserted INT NOT NULL DEFAULT 0,
    rows_updated INT NOT NULL DEFAULT 0,
    rating_changes_created INT NOT NULL DEFAULT 0,
    rows_rejected INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    workflow_run_id TEXT,
    git_sha TEXT,
    error_summary STRING(4000)
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started_at ON ingestion_runs (started_at);

CREATE TABLE IF NOT EXISTS daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    scope TEXT NOT NULL,
    local_authority_code TEXT,
    total_establishments INT NOT NULL DEFAULT 0,
    rated_5_count INT NOT NULL DEFAULT 0,
    rated_0_to_2_count INT NOT NULL DEFAULT 0,
    awaiting_count INT NOT NULL DEFAULT 0,
    new_rating_pending_count INT NOT NULL DEFAULT 0,
    inspections_latest_month INT NOT NULL DEFAULT 0,
    participating_authorities INT NOT NULL DEFAULT 0,
    avg_days_since_inspection FLOAT8,
    business_type_mix JSONB,
    rating_distribution JSONB,
    inspections_by_month JSONB,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (metric_date, scope, local_authority_code)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_scope_date ON daily_metrics (scope, metric_date);
