"""Integration-style tests against a real (disposable, local) CockroachDB.

These exercise idempotent-upsert behaviour, rating-change detection, and
stale-record handling — the things that are dishonest to fake with mocks.
Every test uses the `db_conn` fixture (see conftest.py), which skips the
whole test (not the suite) if no local CockroachDB is reachable, so
`uv run pytest` still passes with Docker not running.
"""

from __future__ import annotations

from datetime import date

import psycopg

from ingestor import db
from ingestor.models import EstablishmentRecord


def _make_record(
    fhrs_id: str,
    *,
    la_code: str = "501",
    rating_value: str | None = "5",
    rating_date: date = date(2025, 1, 1),
    new_rating_pending: bool = False,
    hygiene_score: int | None = 5,
    source_extract_date: date = date(2026, 1, 1),
) -> EstablishmentRecord:
    return EstablishmentRecord(
        fhrs_id=fhrs_id,
        business_name="Test Cafe",
        normalised_name="test cafe",
        business_type_id=1,
        business_type_name="Restaurant/Cafe/Canteen",
        local_authority_code=la_code,
        local_authority_name="Test Authority",
        rating_value=rating_value,
        rating_key="fhrs_5_en-GB",
        rating_date=rating_date,
        scheme_type="FHRS",
        new_rating_pending=new_rating_pending,
        hygiene_score=hygiene_score,
        structural_score=5,
        confidence_management_score=5,
        source_extract_date=source_extract_date,
    )


def _seed_authority(conn: psycopg.Connection, code: str = "501") -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO local_authorities (code, name, scheme_type) VALUES (%s, %s, 'FHRS') "
            "ON CONFLICT (code) DO NOTHING",
            (code, "Test Authority"),
        )
    conn.commit()


class TestIdempotentUpsert:
    def test_running_same_batch_twice_no_duplicates(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn)
        records = [_make_record("1"), _make_record("2")]

        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, records, run_id=None)
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, records, run_id=None)

        assert db.count_establishments(db_conn) == 2

    def test_second_run_reports_updates_not_inserts(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn)
        records = [_make_record("1")]

        with db_conn.transaction():
            first = db.upsert_establishments_batch(db_conn, records, run_id=None)
        with db_conn.transaction():
            second = db.upsert_establishments_batch(db_conn, records, run_id=None)

        assert first.inserted == 1
        assert first.updated == 0
        assert second.inserted == 0
        assert second.updated == 1

    def test_reactivates_previously_stale_row(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn)
        record = _make_record("1", source_extract_date=date(2026, 1, 1))
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, [record], run_id=None)
        with db_conn.transaction():
            db.mark_stale(db_conn, "501", date(2026, 2, 1))

        with db_conn.cursor() as cur:
            cur.execute("SELECT is_active FROM establishments WHERE fhrs_id = '1'")
            assert cur.fetchone() == (False,)

        newer_record = _make_record("1", source_extract_date=date(2026, 2, 1))
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, [newer_record], run_id=None)

        with db_conn.cursor() as cur:
            cur.execute("SELECT is_active FROM establishments WHERE fhrs_id = '1'")
            assert cur.fetchone() == (True,)


class TestRatingChangeDetection:
    def test_no_change_creates_no_rating_change_row(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn)
        record = _make_record("1", rating_value="5")
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, [record], run_id=None)
        with db_conn.transaction():
            result = db.upsert_establishments_batch(db_conn, [record], run_id=None)

        assert result.rating_changes == []
        with db_conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM rating_changes")
            assert cur.fetchone() == (0,)

    def test_rating_value_change_creates_rating_change_row(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn)
        original = _make_record("1", rating_value="3")
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, [original], run_id=None)

        updated = _make_record("1", rating_value="5")
        with db_conn.transaction():
            result = db.upsert_establishments_batch(db_conn, [updated], run_id=None)

        assert len(result.rating_changes) == 1
        change = result.rating_changes[0]
        assert change["previous_rating_value"] == "3"
        assert change["new_rating_value"] == "5"

        with db_conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM rating_changes WHERE fhrs_id = '1'")
            assert cur.fetchone() == (1,)

    def test_new_rating_pending_change_detected(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn)
        original = _make_record("1", new_rating_pending=False)
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, [original], run_id=None)

        updated = _make_record("1", new_rating_pending=True)
        with db_conn.transaction():
            result = db.upsert_establishments_batch(db_conn, [updated], run_id=None)

        assert len(result.rating_changes) == 1
        assert result.rating_changes[0]["previous_new_rating_pending"] is False
        assert result.rating_changes[0]["new_new_rating_pending"] is True

    def test_score_change_detected(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn)
        original = _make_record("1", hygiene_score=5)
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, [original], run_id=None)

        updated = _make_record("1", hygiene_score=10)
        with db_conn.transaction():
            result = db.upsert_establishments_batch(db_conn, [updated], run_id=None)

        assert len(result.rating_changes) == 1
        assert result.rating_changes[0]["previous_hygiene_score"] == 5
        assert result.rating_changes[0]["new_hygiene_score"] == 10

    def test_first_sighting_creates_no_rating_change(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn)
        with db_conn.transaction():
            result = db.upsert_establishments_batch(db_conn, [_make_record("1")], run_id=None)
        assert result.rating_changes == []
        assert result.inserted == 1


class TestStaleRecordHandling:
    def test_missing_from_successful_reimport_marked_inactive(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn)
        first_batch = [
            _make_record("1", source_extract_date=date(2026, 1, 1)),
            _make_record("2", source_extract_date=date(2026, 1, 1)),
        ]
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, first_batch, run_id=None)

        # Re-import: only "1" is present this time (as if "2" closed down).
        second_batch = [_make_record("1", source_extract_date=date(2026, 2, 1))]
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, second_batch, run_id=None)
        with db_conn.transaction():
            stale_count = db.mark_stale(db_conn, "501", date(2026, 2, 1))

        assert stale_count == 1
        with db_conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("SELECT fhrs_id, is_active FROM establishments ORDER BY fhrs_id")
            rows = {r["fhrs_id"]: r["is_active"] for r in cur.fetchall()}
        assert rows == {"1": True, "2": False}

    def test_not_marked_stale_when_import_never_completes(self, db_conn: psycopg.Connection) -> None:
        """Simulates a FAILED import: a batch is upserted (partially) but
        mark_stale is never called (the caller only calls it after full
        success) — so no establishment should be flipped inactive."""
        _seed_authority(db_conn)
        first_batch = [
            _make_record("1", source_extract_date=date(2026, 1, 1)),
            _make_record("2", source_extract_date=date(2026, 1, 1)),
        ]
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, first_batch, run_id=None)

        # Simulate a partial/failed re-import: one batch commits, then we
        # never call mark_stale (the orchestration layer only calls it after
        # the whole file succeeds).
        partial_batch = [_make_record("1", source_extract_date=date(2026, 2, 1))]
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, partial_batch, run_id=None)
        # (no mark_stale call here -- import "failed" before completing)

        with db_conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("SELECT fhrs_id, is_active FROM establishments ORDER BY fhrs_id")
            rows = {r["fhrs_id"]: r["is_active"] for r in cur.fetchall()}
        # "2" was never re-seen but is still active, because staleness is
        # only ever applied after a full successful import completes.
        assert rows == {"1": True, "2": True}


class TestBusinessTypeUpsert:
    def test_business_type_is_created_via_fk(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn)
        record = _make_record("1")
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, [record], run_id=None)

        with db_conn.cursor() as cur:
            cur.execute("SELECT description FROM business_types WHERE id = 1")
            assert cur.fetchone() == ("Restaurant/Cafe/Canteen",)


class TestIngestionRuns:
    def test_create_and_update_run(self, db_conn: psycopg.Connection) -> None:
        run_id = db.create_ingestion_run(db_conn, workflow_run_id="123", git_sha="abc")
        db_conn.commit()
        db.update_ingestion_run(db_conn, run_id, status="SUCCESS", rows_seen=10)
        db_conn.commit()

        latest = db.get_latest_ingestion_run(db_conn)
        assert latest is not None
        assert str(latest["id"]) == run_id
        assert latest["status"] == "SUCCESS"
        assert latest["rows_seen"] == 10


class TestVerifyChecks:
    def test_connectivity_ok(self, db_conn: psycopg.Connection) -> None:
        assert db.check_connectivity(db_conn) is True

    def test_no_orphans_on_clean_db(self, db_conn: psycopg.Connection) -> None:
        assert db.count_orphaned_rating_changes(db_conn) == 0
        assert db.count_orphaned_establishments(db_conn) == 0


class TestCleanup:
    def test_cleanup_deletes_only_old_changes(self, db_conn: psycopg.Connection) -> None:
        _seed_authority(db_conn)
        original = _make_record("1", rating_value="3")
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, [original], run_id=None)
        updated = _make_record("1", rating_value="5")
        with db_conn.transaction():
            db.upsert_establishments_batch(db_conn, [updated], run_id=None)

        with db_conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM rating_changes")
            assert cur.fetchone() == (1,)

        # Retention window of 3650 days: nothing is old enough to delete.
        with db_conn.transaction():
            deleted = db.cleanup_old_rating_changes(db_conn, 3650)
        assert deleted == 0

        with db_conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM rating_changes")
            assert cur.fetchone() == (1,)
