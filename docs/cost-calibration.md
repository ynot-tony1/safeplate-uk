# Free-tier cost calibration report

Status: **pending** — this report is produced by importing a 50,000-row
representative sample (see task list), building the production indexes,
refreshing metrics, and measuring CockroachDB Cloud storage + Request Unit
usage before and after. It is filled in during that step, not invented
ahead of time.

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

## Results

_Not yet run. This section will contain: baseline storage/RU, post-sample
storage/RU, per-row deltas, full-dataset projection with 30% margin, target
comparison, and the explicit go/no-go recommendation for the full import._

## Approval

The full-dataset import will **not** run until this report is complete and
the user has explicitly approved proceeding (or explicitly deferred it).
