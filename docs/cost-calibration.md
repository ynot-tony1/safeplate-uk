# Free-tier cost calibration report

Status: **calibration sample imported and measured; storage/RU precision
limited by CockroachDB Serverless SQL access — see "What couldn't be
measured" below.**

## Method

1. Record baseline storage (MiB) and RU consumption from the CockroachDB
   Cloud console for the empty `food_hygiene` database with migrations
   applied.
2. Run `ingestor import-all --authorities <a representative subset totalling
   ~50,000 establishments>`.
3. Run `ingestor refresh-metrics`.
4. Record storage and RU usage again.
5. Compute per-row storage cost and per-import RU cost from the delta.
6. Project full-dataset figures (~500,000-600,000 UK establishments) by
   linear scaling, then add a 30% safety margin.
7. Compare the projection against the target ceilings: ~2 GiB stored data,
   ~8,000,000 monthly Request Units under normal operation (daily
   incremental ingestion + application read traffic).
8. If the projection exceeds target, apply mitigations in this priority
   order before re-measuring: drop unused address-line fields, cap
   rating-history retention, drop any index that calibration shows is
   unused, reduce DailyMetric granularity, or restrict the initial import
   to a subset of local authorities/countries.

## What was actually run

Sample: 7 local authorities chosen for a representative mix (large/small,
urban/rural, England/FHRS and Scotland/FHIS, and both scheme types),
selected from the live FSA authorities API at calibration time:

| Code | Authority | Country/Scheme | Establishments |
|---|---|---|---|
| 402 | Birmingham | England, FHRS | 10,122 |
| 413 | Leeds | England, FHRS | 7,396 |
| 250 | North Yorkshire | England, FHRS | 7,075 |
| 776 | Glasgow City | Scotland, FHIS | 6,588 |
| 415 | Manchester | England, FHRS | 6,423 |
| 281 | Somerset | England, FHRS | 6,076 |
| 777 | Highland | Scotland, FHIS | 5,983 |
| | **Total** | | **49,663** |

Result, verified against the live production database and the deployed
dashboard at `https://safeplate-uk.vercel.app`:

- **rows_seen / rows_inserted: 49,663 / 49,663**, 0 rejected, all 7
  authorities imported successfully.
- `refresh-metrics` completed successfully across 364 scopes (1 global +
  363 local authorities — `discover` populates every UK authority's
  metadata even though only 7 have establishment data yet).
- Confirmed live on the dashboard: 49,663 indexed establishments, 23,717
  rated 5, 1,360 rated 0–2, 9,969 awaiting/new-rating-pending — all read
  through the full stack (CockroachDB → Prisma → Next.js → Vercel), not
  synthetic numbers.
- Search, map, and local-authority pages all return 200 against the live
  deployment with this real data present.

## What couldn't be measured, and why

The full dataset's total (~610,834 establishments across 363 authorities,
per the live FSA discovery API at calibration time) gives a **projection
factor of ~12.3×** from this sample. Storage and Request Unit figures for
that projection require CockroachDB Cloud's own metrics, which turned out
not to be reachable via SQL on this cluster's Serverless tier:

- `crdb_internal.*` views: access restricted outright for non-admin
  sessions.
- `SHOW RANGES ... WITH DETAILS` (which includes per-range disk-byte
  stats): requires the `VIEWACTIVITY` role option, which none of the
  least-privilege application roles hold (correctly, per this project's
  security design — see `docs/security.md`).
- Retried with `food_migrator` (the most privileged application role):
  hit a different error, an RPC-level tenant-keyspan restriction specific
  to CockroachDB Serverless's multi-tenant architecture — this appears to
  be a genuine platform limitation for this tier, not a grants problem.
- Postgres-compatible size functions (`pg_size_pretty`,
  `pg_total_relation_size`) are not implemented in CockroachDB at all.

**Recommended next step:** open the CockroachDB Cloud console for the
`safe-hippo` cluster and read **Storage Used** and **Request Units
consumed** directly from the Cluster Overview / Metrics page — a
one-minute check with no API key or code changes required. This report's
projection below is a defensible engineering estimate to unblock a
decision now, not a substitute for that console reading.

## Storage projection (estimated, pending console verification)

Estimated per-row cost for `establishments`, based on the actual committed
schema (average column widths for real FSA data, plus CockroachDB's
per-row key/version overhead and its 9 secondary indexes on this table):

- Base row (primary index): ~420 bytes
- Secondary index overhead (9 indexes × ~40 bytes avg entry): ~360 bytes
- **Estimated total: ~780 bytes/establishment row**

`local_authorities`, `business_types`, and `daily_metrics` are all small
relative to `establishments` (hundreds of rows, not hundreds of thousands)
and are not significant contributors at this stage.

| | Establishments | Estimated storage |
|---|---|---|
| Calibration sample | 49,663 | ~39 MB |
| Full dataset projection | ~610,834 | ~489 MB |
| **With 30% safety margin** | | **~636 MB (~0.62 GiB)** |

Against the ~2 GiB target, this projects to roughly **31% of budget** —
comfortably under, even accounting for the estimate's uncertainty (it
could plausibly be off by ±40% and still clear the target with margin).
`rating_changes` growth over time and `daily_metrics` accumulation (one
row per authority per day) are the main components not captured in a
single snapshot; both are small per-row and bounded by the mitigations
already available (retention caps) if they ever become material.

## Request Units

Not independently measurable via SQL for the reasons above. The full
import (~610,834 rows) will perform roughly 12.3× the batched
insert/index-maintenance work of this calibration run, plus one-time
`discover` and `refresh-metrics` overhead that doesn't scale linearly with
row count. Please check the console's RU figure for this calibration run
and compare against the ~8,000,000/month target — if the per-run RU figure
sits comfortably below that when scaled by ~12.3×, normal operation
(nightly incremental ingestion, which only touches *changed* authorities,
not the full dataset) should use dramatically less than a one-time full
import.

## Recommendation

The measured evidence (real 49,663-row import, zero rejections, all
downstream features working against real data) and the storage estimate
(well under budget even with a wide error margin) both support proceeding
to the full import. **This is a recommendation, not an approval** — per
this project's requirements, the full-dataset import will not run until
you explicitly approve it, ideally after a quick console check of the two
figures above.

## Approval

**Awaiting explicit approval to proceed with the full-dataset import.**
