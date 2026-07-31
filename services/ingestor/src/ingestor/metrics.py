"""Computation of `daily_metrics` rows via aggregate SQL (no row-by-row
Python loops over establishments).

Writes one `scope='global'` row plus one row per local authority
(`scope=<code>`) for a given `as_of` date. Because the destination table's
unique constraint is on (metric_date, scope, local_authority_code) and
`local_authority_code` is NULL for the global row, and NULL is never
"equal" to NULL under a plain unique index/ON CONFLICT target, we do an
explicit `DELETE ... WHERE ... IS NOT DISTINCT FROM ...` followed by
`INSERT` per scope row (still just ~1 + N-authorities statements, not one
per establishment) to keep repeated runs idempotent.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

import psycopg
import structlog
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

logger = structlog.get_logger(__name__)

_MONTHS_OF_HISTORY = 12

_GLOBAL_AGGREGATE_SQL = """
WITH active AS (
    SELECT * FROM establishments WHERE is_active = true
)
SELECT
    (SELECT count(*) FROM active) AS total_establishments,
    (SELECT count(*) FROM active WHERE rating_value = '5') AS rated_5_count,
    (SELECT count(*) FROM active WHERE rating_value IN ('0', '1', '2')) AS rated_0_to_2_count,
    (SELECT count(*) FROM active WHERE rating_value ILIKE 'awaiting%%') AS awaiting_count,
    (SELECT count(*) FROM active WHERE new_rating_pending = true) AS new_rating_pending_count,
    (SELECT count(*) FROM active
        WHERE date_trunc('month', rating_date) = date_trunc('month', %(as_of)s::date)
    ) AS inspections_latest_month,
    (SELECT count(*) FROM local_authorities WHERE last_extract_date IS NOT NULL) AS participating_authorities,
    (SELECT avg(%(as_of)s::date - rating_date)
        FROM active WHERE rating_date IS NOT NULL) AS avg_days_since_inspection,
    (SELECT jsonb_object_agg(coalesce(business_type_name, 'Unknown'), cnt)
        FROM (SELECT business_type_name, count(*) AS cnt FROM active
              GROUP BY business_type_name) t
    ) AS business_type_mix,
    (SELECT jsonb_object_agg(coalesce(rating_value, 'Unknown'), cnt)
        FROM (SELECT rating_value, count(*) AS cnt FROM active
              GROUP BY rating_value) t
    ) AS rating_distribution,
    (SELECT jsonb_object_agg(month_key, cnt)
        FROM (
            SELECT to_char(date_trunc('month', rating_date), 'YYYY-MM') AS month_key, count(*) AS cnt
            FROM active
            WHERE rating_date >= (date_trunc('month', %(as_of)s::date) - (%(months)s * INTERVAL '1 month'))
              AND rating_date IS NOT NULL
            GROUP BY month_key
        ) t
    ) AS inspections_by_month
"""

_PER_AUTHORITY_AGGREGATE_SQL = """
SELECT
    la.code AS local_authority_code,
    count(e.fhrs_id) FILTER (WHERE e.is_active) AS total_establishments,
    count(*) FILTER (WHERE e.is_active AND e.rating_value = '5') AS rated_5_count,
    count(*) FILTER (WHERE e.is_active AND e.rating_value IN ('0', '1', '2')) AS rated_0_to_2_count,
    count(*) FILTER (WHERE e.is_active AND e.rating_value ILIKE 'awaiting%%') AS awaiting_count,
    count(*) FILTER (WHERE e.is_active AND e.new_rating_pending = true) AS new_rating_pending_count,
    count(*) FILTER (
        WHERE e.is_active AND date_trunc('month', e.rating_date) = date_trunc('month', %(as_of)s::date)
    ) AS inspections_latest_month,
    avg(%(as_of)s::date - e.rating_date)
        FILTER (WHERE e.is_active AND e.rating_date IS NOT NULL) AS avg_days_since_inspection
FROM local_authorities la
LEFT JOIN establishments e ON e.local_authority_code = la.code
GROUP BY la.code
"""

_PER_AUTHORITY_BUSINESS_TYPE_MIX_SQL = """
SELECT local_authority_code, jsonb_object_agg(coalesce(business_type_name, 'Unknown'), cnt) AS mix
FROM (
    SELECT local_authority_code, business_type_name, count(*) AS cnt
    FROM establishments WHERE is_active = true
    GROUP BY local_authority_code, business_type_name
) t
GROUP BY local_authority_code
"""

_PER_AUTHORITY_RATING_DISTRIBUTION_SQL = """
SELECT local_authority_code, jsonb_object_agg(coalesce(rating_value, 'Unknown'), cnt) AS dist
FROM (
    SELECT local_authority_code, rating_value, count(*) AS cnt
    FROM establishments WHERE is_active = true
    GROUP BY local_authority_code, rating_value
) t
GROUP BY local_authority_code
"""

_PER_AUTHORITY_INSPECTIONS_BY_MONTH_SQL = """
SELECT local_authority_code, jsonb_object_agg(month_key, cnt) AS months
FROM (
    SELECT local_authority_code,
           to_char(date_trunc('month', rating_date), 'YYYY-MM') AS month_key,
           count(*) AS cnt
    FROM establishments
    WHERE is_active = true
      AND rating_date >= (date_trunc('month', %(as_of)s::date) - (%(months)s * INTERVAL '1 month'))
      AND rating_date IS NOT NULL
    GROUP BY local_authority_code, month_key
) t
GROUP BY local_authority_code
"""

_METRIC_COLUMNS = (
    "metric_date",
    "scope",
    "local_authority_code",
    "total_establishments",
    "rated_5_count",
    "rated_0_to_2_count",
    "awaiting_count",
    "new_rating_pending_count",
    "inspections_latest_month",
    "participating_authorities",
    "avg_days_since_inspection",
    "business_type_mix",
    "rating_distribution",
    "inspections_by_month",
)


@dataclass
class MetricsResult:
    scopes_written: int


def refresh_metrics(conn: psycopg.Connection, as_of: date) -> MetricsResult:
    """Recompute and upsert one 'global' row and one row per local authority
    for `as_of`."""
    rows_to_write: list[dict[str, object]] = []

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(_GLOBAL_AGGREGATE_SQL, {"as_of": as_of, "months": _MONTHS_OF_HISTORY})
        global_row = cur.fetchone()
        assert global_row is not None
        rows_to_write.append(
            {
                "metric_date": as_of,
                "scope": "global",
                "local_authority_code": None,
                "total_establishments": global_row["total_establishments"] or 0,
                "rated_5_count": global_row["rated_5_count"] or 0,
                "rated_0_to_2_count": global_row["rated_0_to_2_count"] or 0,
                "awaiting_count": global_row["awaiting_count"] or 0,
                "new_rating_pending_count": global_row["new_rating_pending_count"] or 0,
                "inspections_latest_month": global_row["inspections_latest_month"] or 0,
                "participating_authorities": global_row["participating_authorities"] or 0,
                "avg_days_since_inspection": global_row["avg_days_since_inspection"],
                "business_type_mix": global_row["business_type_mix"],
                "rating_distribution": global_row["rating_distribution"],
                "inspections_by_month": global_row["inspections_by_month"],
            }
        )

        cur.execute(_PER_AUTHORITY_AGGREGATE_SQL, {"as_of": as_of})
        per_authority = {row["local_authority_code"]: row for row in cur.fetchall()}

        cur.execute(_PER_AUTHORITY_BUSINESS_TYPE_MIX_SQL)
        business_type_mix_by_code = {row["local_authority_code"]: row["mix"] for row in cur.fetchall()}

        cur.execute(_PER_AUTHORITY_RATING_DISTRIBUTION_SQL)
        rating_distribution_by_code = {row["local_authority_code"]: row["dist"] for row in cur.fetchall()}

        cur.execute(_PER_AUTHORITY_INSPECTIONS_BY_MONTH_SQL, {"as_of": as_of, "months": _MONTHS_OF_HISTORY})
        inspections_by_month_by_code = {row["local_authority_code"]: row["months"] for row in cur.fetchall()}

    for code, row in per_authority.items():
        rows_to_write.append(
            {
                "metric_date": as_of,
                "scope": code,
                "local_authority_code": code,
                "total_establishments": row["total_establishments"] or 0,
                "rated_5_count": row["rated_5_count"] or 0,
                "rated_0_to_2_count": row["rated_0_to_2_count"] or 0,
                "awaiting_count": row["awaiting_count"] or 0,
                "new_rating_pending_count": row["new_rating_pending_count"] or 0,
                "inspections_latest_month": row["inspections_latest_month"] or 0,
                "participating_authorities": 0,
                "avg_days_since_inspection": row["avg_days_since_inspection"],
                "business_type_mix": business_type_mix_by_code.get(code),
                "rating_distribution": rating_distribution_by_code.get(code),
                "inspections_by_month": inspections_by_month_by_code.get(code),
            }
        )

    for row in rows_to_write:
        _upsert_daily_metric_row(conn, row)

    logger.info("metrics.refreshed", as_of=str(as_of), scopes=len(rows_to_write))
    return MetricsResult(scopes_written=len(rows_to_write))


_JSONB_FIELDS = ("business_type_mix", "rating_distribution", "inspections_by_month")


def _upsert_daily_metric_row(conn: psycopg.Connection, row: dict[str, object]) -> None:
    # psycopg3 needs an explicit Jsonb() wrapper to serialise a Python dict
    # back into a jsonb column (it comes back as a plain dict from the
    # earlier SELECT ... jsonb_object_agg query, which is not itself adaptable).
    params = dict(row)
    for field_name in _JSONB_FIELDS:
        value = params.get(field_name)
        if value is not None:
            params[field_name] = Jsonb(value)

    # Prisma's @default(uuid()) is generated by Prisma Client itself, not a
    # database-level DEFAULT — raw SQL inserts (this ingestor never uses
    # Prisma Client) must supply the id explicitly or hit a NOT NULL
    # violation on the primary key.
    params["id"] = str(uuid.uuid4())

    with conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM daily_metrics
            WHERE metric_date = %(metric_date)s
              AND scope = %(scope)s
              AND local_authority_code IS NOT DISTINCT FROM %(local_authority_code)s
            """,
            params,
        )
        columns_sql = ", ".join((*_METRIC_COLUMNS, "id"))
        placeholders = ", ".join(f"%({c})s" for c in (*_METRIC_COLUMNS, "id"))
        cur.execute(
            f"INSERT INTO daily_metrics ({columns_sql}) VALUES ({placeholders})",  # noqa: S608
            params,
        )
