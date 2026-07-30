# Architecture notes

## Why these indexes and no more

CockroachDB indexes cost storage and write amplification, so this project
starts with only the indexes the required features actually justify:

- `normalisedName` — business-name prefix search on `/establishments`.
- `postcodePrefix` — postcode search.
- `localAuthorityCode`, `businessTypeId`, `ratingKey`, `ratingDate`,
  `schemeType`, `newRatingPending` — the filter/sort fields exposed on
  `/establishments`.
- `[latitude, longitude]` — bounded-range viewport queries on `/map`. This
  is a plain composite B-tree index used with `WHERE latitude BETWEEN ...
  AND longitude BETWEEN ...`, not a geospatial extension — deliberately, per
  the project's free-tier and dependency-footprint constraints. It is
  sufficient for bounding-box viewport loads at this data scale; a proper
  geospatial index (e.g. PostGIS-equivalent) would only be justified if
  query latency measured against real data proves this insufficient.

No other composite indexes are created up front. If calibration (see
`docs/cost-calibration.md`) shows a specific query pattern needs one, it
gets added deliberately with a comment explaining the measured need — not
speculatively.

## Why RatingChange is append-only and sparse

Every ingestion run re-fetches full authority extracts, so a naive design
would re-write every establishment on every run. Instead, `establishments`
holds only the latest known snapshot, and `rating_changes` gets a new row
**only** when rating, rating date, new-rating-pending, or a score component
actually differs from the previous snapshot. This keeps write volume and
storage proportional to real-world change, not to ingestion frequency.

## Why DailyMetric is precomputed

`/`. and `/local-authorities` need aggregate statistics (rating
distributions, proportions, recency averages) across potentially hundreds
of thousands of rows. Computing these live on every page request would be
expensive and would not scale within CockroachDB Cloud's free-tier Request
Unit budget. `ingestor refresh-metrics` computes them once per ingestion
run via aggregate SQL and stores compact JSON/columnar summaries that
dashboard pages read directly.

## Why three database roles

See `docs/security.md`. In short: the Vercel-hosted application only ever
needs to read data, the ingestor only ever needs to write establishment
data (never change schema), and only a manually-triggered migration
workflow ever runs DDL. A compromised Vercel environment variable, for
example, cannot be used to alter the schema or corrupt bulk data.

## Why no PostGIS-equivalent extension

The map explorer only needs bounded-viewport queries and simple distance
sorting for a UK-sized dataset (a few hundred thousand rows at most). A
full geospatial extension would add operational complexity and CockroachDB
Cloud compatibility risk for a capability a composite B-tree index plus
in-application Haversine distance calculation already covers at this
scale.
