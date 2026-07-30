# Data sources

SafePlate UK is built entirely from the Food Standards Agency's official
open data. No API key is required for the core project.

## FHRS vs FHIS

- **FHRS (Food Hygiene Rating Scheme)** covers England, Wales, and Northern
  Ireland. Establishments receive a numeric rating from 0 (urgent
  improvement necessary) to 5 (very good).
- **FHIS (Food Hygiene Information Scheme)** covers Scotland. Establishments
  receive a "Pass" or "Improvement Required" outcome rather than a numeric
  score.

Both schemes are recorded in the `scheme_type` field on every establishment,
and the dashboard/local-authority views break statistics down by scheme
where the distinction is meaningful.

## Discovery vs bulk import

- **Source discovery** (`ingestor discover`): queries the FSA's official
  open-data API for the current list of participating local authorities,
  each authority's current open-data file URL, and its current extract
  date. Used to decide which authorities need re-importing, and for
  selective lookups — never for bulk data retrieval.
- **Bulk import** (`ingestor import-authority` / `import-all`): downloads
  and streams each authority's official open-data XML file directly. This
  is the only path used to populate establishment data.

The FSA's HTML search interface at `ratings.food.gov.uk` is never scraped.

## Limitations

- **Rating currency**: a rating reflects the inspection that produced it,
  not necessarily the establishment's current state. The application always
  displays the rating date and the source extract date alongside any
  rating, and never claims a rating is "current" beyond that extract date.
- **Geolocation**: coordinates are supplied by the local authority in the
  open-data file and are not independently verified by this project. Some
  establishments have no coordinates and are excluded from map/distance
  features.
- **Update cadence**: local authorities publish updated extracts at their
  own cadence (commonly monthly), not continuously. The ingestion schedule
  checks daily for changed extracts but cannot surface an inspection sooner
  than the authority publishes it.
- **New-rating-pending**: some establishments are flagged as awaiting a new
  rating or inspection; this is surfaced explicitly rather than implied by
  a missing or stale rating.

Canonical references: https://ratings.food.gov.uk/open-data and
https://www.food.gov.uk/.
