"""Shared pytest fixtures.

No live network calls are made anywhere in this test suite. DB-dependent
tests use a disposable local CockroachDB test database
(`food_hygiene_ingestor_test`, kept separate from the web app's
`food_hygiene` database so we never race its Prisma migrations) and are
skipped gracefully — not failed — if that database is unreachable, so
`uv run pytest` still passes in an environment without Docker running.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"

TEST_DATABASE_URL = os.environ.get(
    "INGESTOR_TEST_DATABASE_URL",
    "postgresql://root@localhost:26257/food_hygiene_ingestor_test?sslmode=disable",
)


def _database_name(url: str) -> str:
    return urlsplit(url).path.lstrip("/")


def _bootstrap_url(url: str) -> str:
    """Same connection, but pointed at CockroachDB's always-present
    `defaultdb`, used only to CREATE DATABASE IF NOT EXISTS the disposable
    test database on first use."""
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path="/defaultdb"))


def _try_connect() -> psycopg.Connection | None:
    target_db = _database_name(TEST_DATABASE_URL)
    try:
        with psycopg.connect(_bootstrap_url(TEST_DATABASE_URL), connect_timeout=2) as bootstrap_conn:
            bootstrap_conn.autocommit = True
            with bootstrap_conn.cursor() as cur:
                cur.execute(f'CREATE DATABASE IF NOT EXISTS "{target_db}"')  # noqa: S608
    except psycopg.Error:
        return None
    try:
        return psycopg.connect(TEST_DATABASE_URL, connect_timeout=2)
    except psycopg.Error:
        return None


@pytest.fixture
def db_conn() -> Iterator[psycopg.Connection]:
    """A connection to a disposable local test database, with schema applied
    and every table truncated before the test runs. Skips the test if no
    local CockroachDB is reachable."""
    conn = _try_connect()
    if conn is None:
        pytest.skip(f"local test database not reachable at {TEST_DATABASE_URL!r}")
    assert conn is not None
    try:
        schema_sql = (FIXTURES_DIR / "schema.sql").read_text()
        with conn.cursor() as cur:
            cur.execute(schema_sql)
        conn.commit()
        _truncate_all(conn)
        yield conn
    finally:
        conn.close()


def _truncate_all(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "TRUNCATE rating_changes, establishments, business_types, "
            "local_authorities, ingestion_runs, daily_metrics CASCADE"
        )
    conn.commit()


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES_DIR
