"""Integration tests for daily_metrics aggregate refresh. Skipped gracefully
if no local test CockroachDB is reachable (see conftest.py)."""

from __future__ import annotations

from datetime import date

import psycopg
from psycopg.rows import dict_row

from ingestor import db, metrics
from ingestor.models import EstablishmentRecord


def _seed_authority(conn: psycopg.Connection, code: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO local_authorities (code, name, scheme_type, last_extract_date) "
            "VALUES (%s, %s, 'FHRS', %s) ON CONFLICT (code) DO NOTHING",
            (code, f"Authority {code}", date(2026, 1, 1)),
        )
    conn.commit()


def _record(fhrs_id: str, la_code: str, rating_value: str, rating_date: date) -> EstablishmentRecord:
    return EstablishmentRecord(
        fhrs_id=fhrs_id,
        business_name=f"Place {fhrs_id}",
        normalised_name=f"place {fhrs_id}",
        business_type_id=1,
        business_type_name="Restaurant/Cafe/Canteen",
        local_authority_code=la_code,
        local_authority_name=f"Authority {la_code}",
        rating_value=rating_value,
        rating_key=f"fhrs_{rating_value}_en-GB",
        rating_date=rating_date,
        scheme_type="FHRS",
        new_rating_pending=False,
        source_extract_date=date(2026, 1, 1),
    )


class TestRefreshMetrics:
    def test_global_and_per_authority_rows_written(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn, "501")
        records = [
            _record("1", "501", "5", date(2026, 1, 5)),
            _record("2", "501", "1", date(2026, 1, 6)),
            _record("3", "501", "AwaitingInspection", date(2026, 1, 7)),
        ]
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, records, run_id=None)

        as_of = date(2026, 1, 15)
        with db_conn.transaction():
            result = metrics.refresh_metrics(db_conn, as_of)

        assert result.scopes_written == 2  # global + one authority

        with db_conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM daily_metrics WHERE metric_date = %s AND scope = 'global'", (as_of,)
            )
            global_row = cur.fetchone()
        assert global_row is not None
        assert global_row["total_establishments"] == 3
        assert global_row["rated_5_count"] == 1
        assert global_row["rated_0_to_2_count"] == 1
        assert global_row["awaiting_count"] == 1

        with db_conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM daily_metrics WHERE metric_date = %s AND scope = '501'", (as_of,)
            )
            authority_row = cur.fetchone()
        assert authority_row is not None
        assert authority_row["total_establishments"] == 3
        assert authority_row["local_authority_code"] == "501"

    def test_rerunning_is_idempotent(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn, "501")
        records = [_record("1", "501", "5", date(2026, 1, 5))]
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, records, run_id=None)

        as_of = date(2026, 1, 15)
        with db_conn.transaction():
            metrics.refresh_metrics(db_conn, as_of)
        with db_conn.transaction():
            metrics.refresh_metrics(db_conn, as_of)

        with db_conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM daily_metrics WHERE metric_date = %s", (as_of,))
            assert cur.fetchone() == (2,)

    def test_inactive_establishments_excluded(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn, "501")
        record = _record("1", "501", "5", date(2026, 1, 5))
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, [record], run_id=None)
        with db_conn.transaction():
            db.mark_stale(db_conn, "501", date(2026, 6, 1))

        as_of = date(2026, 1, 15)
        with db_conn.transaction():
            metrics.refresh_metrics(db_conn, as_of)

        with db_conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT total_establishments FROM daily_metrics WHERE metric_date = %s AND scope = 'global'",
                (as_of,),
            )
            row = cur.fetchone()
        assert row is not None
        assert row["total_establishments"] == 0
