-- daily_metrics is fully derived/precomputed (regenerated in full on every
-- refresh-metrics run), unlike establishment/rating data, so a narrow
-- DELETE grant here carries no real data-loss risk. refresh-metrics uses a
-- DELETE-then-INSERT pattern (not INSERT ... ON CONFLICT) specifically
-- because the unique index on (metric_date, scope, local_authority_code)
-- can't reliably catch conflicts for the global-scope row, where
-- local_authority_code is NULL — standard SQL treats NULLs as distinct
-- for uniqueness purposes, so ON CONFLICT would silently insert
-- duplicates rather than update.
-- CREATE ROLE IF NOT EXISTS keeps this migration portable to local/CI
-- databases where food_ingestor doesn't exist (a harmless, unused role
-- there) — in production it's a no-op since the role already exists.
CREATE ROLE IF NOT EXISTS food_ingestor;
GRANT DELETE ON "daily_metrics" TO food_ingestor;
