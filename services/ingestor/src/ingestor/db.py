"""Raw SQL access layer (psycopg3) for CockroachDB.

No ORM: raw, batched `INSERT ... ON CONFLICT` statements only. Every write
here is designed to be safely re-run (idempotent upserts on primary keys),
and nothing here ever deletes `establishments` rows — staleness is handled
by flipping `is_active`, only after a whole authority's import has fully
succeeded (see `mark_stale`).
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

import psycopg
import structlog
from psycopg import sql
from psycopg.rows import dict_row

from ingestor.models import DiscoveryAuthority, EstablishmentRecord

logger = structlog.get_logger(__name__)


_DEBIAN_CA_BUNDLE = "/etc/ssl/certs/ca-certificates.crt"


def connect(dsn: str) -> psycopg.Connection:
    """Open a new connection. Callers own the connection's lifecycle
    (use as a context manager). Never logs `dsn`.

    For verify-full/verify-ca DSNs, points sslrootcert at the system CA
    bundle rather than libpq's default ~/.postgresql/root.crt (which
    doesn't exist in this image). Node-based tooling elsewhere in this
    project (the web app, Prisma migrations) trusts the system store
    automatically for the same connections; libpq does not unless told to.

    Uses the concrete bundle file path, not sslrootcert="system" — verified
    directly against the real CockroachDB Cloud endpoint that this libpq
    build's "system" keyword fails verification ("SSL error: certificate
    verify failed") even though the identical chain validates fine via
    Python's own ssl module and via the explicit file path, which succeeds
    (confirmed by reaching a real auth-failure error past the TLS layer).
    libpq rejects sslrootcert combined with sslmode=disable (local dev), so
    it's only added when certificate verification is actually requested.
    """
    if "sslmode=verify-full" in dsn or "sslmode=verify-ca" in dsn:
        return psycopg.connect(dsn, autocommit=False, sslrootcert=_DEBIAN_CA_BUNDLE)
    return psycopg.connect(dsn, autocommit=False)


# --------------------------------------------------------------------------
# local_authorities
# --------------------------------------------------------------------------


def upsert_local_authorities(conn: psycopg.Connection, authorities: Sequence[DiscoveryAuthority]) -> int:
    """Batch upsert discovered authorities. Does not touch last_extract_date
    (that is only updated on a successful per-authority XML import)."""
    if not authorities:
        return 0
    rows = [(a.code, a.name, a.region_name, a.scheme_type, a.file_name) for a in authorities]
    values_sql = sql.SQL(", ").join(sql.SQL("(%s,%s,%s,%s,%s)") for _ in rows)
    query = sql.SQL(
        """
        INSERT INTO local_authorities (code, name, region_name, scheme_type, open_data_url)
        VALUES {values}
        ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            region_name = EXCLUDED.region_name,
            scheme_type = EXCLUDED.scheme_type,
            open_data_url = EXCLUDED.open_data_url,
            updated_at = now()
        """
    ).format(values=values_sql)
    params = [v for row in rows for v in row]
    with conn.cursor() as cur:
        cur.execute(query, params)
    return len(rows)


def get_local_authority(conn: psycopg.Connection, code: str) -> dict[str, object] | None:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT code, name, region_name, scheme_type, open_data_url, last_extract_date
            FROM local_authorities WHERE code = %s
            """,
            (code,),
        )
        return cur.fetchone()


def list_local_authority_codes(conn: psycopg.Connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT code FROM local_authorities ORDER BY code")
        return [row[0] for row in cur.fetchall()]


def update_local_authority_extract_date(conn: psycopg.Connection, code: str, extract_date: date) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE local_authorities SET last_extract_date = %s, updated_at = now() WHERE code = %s",
            (extract_date, code),
        )


# --------------------------------------------------------------------------
# business_types
# --------------------------------------------------------------------------


def upsert_business_types(conn: psycopg.Connection, pairs: set[tuple[int, str]]) -> None:
    if not pairs:
        return
    rows = sorted(pairs)
    values_sql = sql.SQL(", ").join(sql.SQL("(%s,%s)") for _ in rows)
    query = sql.SQL(
        """
        INSERT INTO business_types (id, description)
        VALUES {values}
        ON CONFLICT (id) DO UPDATE SET
            description = EXCLUDED.description,
            updated_at = now()
        """
    ).format(values=values_sql)
    params = [v for row in rows for v in row]
    with conn.cursor() as cur:
        cur.execute(query, params)


# --------------------------------------------------------------------------
# establishments + rating_changes
# --------------------------------------------------------------------------

_TRACKED_CHANGE_FIELDS = (
    "rating_value",
    "rating_date",
    "new_rating_pending",
    "hygiene_score",
    "structural_score",
    "confidence_management_score",
)

_ESTABLISHMENT_COLUMNS = (
    "fhrs_id",
    "business_name",
    "normalised_name",
    "business_type_id",
    "business_type_name",
    "address_line_1",
    "address_line_2",
    "address_line_3",
    "address_line_4",
    "postcode",
    "postcode_prefix",
    "local_authority_code",
    "local_authority_name",
    "local_authority_web_site",
    "local_authority_email",
    "rating_value",
    "rating_key",
    "rating_date",
    "scheme_type",
    "new_rating_pending",
    "hygiene_score",
    "structural_score",
    "confidence_management_score",
    "longitude",
    "latitude",
    "source_extract_date",
)


def fetch_existing_states(conn: psycopg.Connection, fhrs_ids: Sequence[str]) -> dict[str, dict[str, object]]:
    """Fetch the current tracked-field state for a set of fhrs_ids, keyed by
    fhrs_id. Used both to detect inserts-vs-updates and to diff for
    rating_changes, *before* the batch upsert overwrites them."""
    if not fhrs_ids:
        return {}
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT fhrs_id, rating_value, rating_date, new_rating_pending,
                   hygiene_score, structural_score, confidence_management_score
            FROM establishments
            WHERE fhrs_id = ANY(%s)
            """,
            (list(fhrs_ids),),
        )
        return {row["fhrs_id"]: row for row in cur.fetchall()}


@dataclass
class BatchUpsertResult:
    inserted: int
    updated: int
    rating_changes: list[dict[str, object]]


def upsert_establishments_batch(
    conn: psycopg.Connection,
    records: Sequence[EstablishmentRecord],
    *,
    run_id: str | None,
) -> BatchUpsertResult:
    """Upsert one batch of validated establishment records.

    Ensures referenced business_types exist first (FK), diffs against prior
    state to build rating_changes rows (only for genuinely-changed tracked
    fields on pre-existing establishments), then performs a single
    multi-row `INSERT ... ON CONFLICT (fhrs_id) DO UPDATE` for the batch.
    Caller controls the transaction boundary (one batch = one transaction).
    """
    if not records:
        return BatchUpsertResult(inserted=0, updated=0, rating_changes=[])

    business_type_pairs = {
        (r.business_type_id, r.business_type_name or "")
        for r in records
        if r.business_type_id is not None
    }
    upsert_business_types(conn, business_type_pairs)

    fhrs_ids = [r.fhrs_id for r in records]
    old_states = fetch_existing_states(conn, fhrs_ids)

    rating_changes: list[dict[str, object]] = []
    for record in records:
        old = old_states.get(record.fhrs_id)
        if old is None:
            continue  # first time we've seen this establishment: no diff to record
        changed = any(_changed(old, record, field) for field in _TRACKED_CHANGE_FIELDS)
        if not changed:
            continue
        rating_changes.append(
            {
                "fhrs_id": record.fhrs_id,
                "previous_rating_value": old["rating_value"],
                "new_rating_value": record.rating_value,
                "previous_rating_date": old["rating_date"],
                "new_rating_date": record.rating_date,
                "previous_new_rating_pending": old["new_rating_pending"],
                "new_new_rating_pending": record.new_rating_pending,
                "previous_hygiene_score": old["hygiene_score"],
                "new_hygiene_score": record.hygiene_score,
                "previous_structural_score": old["structural_score"],
                "new_structural_score": record.structural_score,
                "previous_confidence_score": old["confidence_management_score"],
                "new_confidence_score": record.confidence_management_score,
                "ingestion_run_id": run_id,
            }
        )

    _bulk_upsert_establishments(conn, records)
    if rating_changes:
        _bulk_insert_rating_changes(conn, rating_changes)

    inserted = sum(1 for r in records if r.fhrs_id not in old_states)
    updated = len(records) - inserted
    return BatchUpsertResult(inserted=inserted, updated=updated, rating_changes=rating_changes)


def _changed(old: dict[str, object], record: EstablishmentRecord, field: str) -> bool:
    return bool(old.get(field) != getattr(record, field))


def _bulk_upsert_establishments(conn: psycopg.Connection, records: Sequence[EstablishmentRecord]) -> None:
    row_placeholder = "(" + ",".join(["%s"] * len(_ESTABLISHMENT_COLUMNS)) + ",true,now(),now(),now(),now())"
    values_sql = sql.SQL(", ").join(sql.SQL(row_placeholder) for _ in records)
    update_set = sql.SQL(", ").join(
        sql.SQL("{col} = EXCLUDED.{col}").format(col=sql.Identifier(c))
        for c in _ESTABLISHMENT_COLUMNS
        if c != "fhrs_id"
    )
    columns_sql = sql.SQL(", ").join(sql.Identifier(c) for c in _ESTABLISHMENT_COLUMNS)
    query = sql.SQL(
        """
        INSERT INTO establishments ({columns}, is_active, first_seen_at, last_seen_at, created_at, updated_at)
        VALUES {values}
        ON CONFLICT (fhrs_id) DO UPDATE SET
            {update_set},
            is_active = true,
            last_seen_at = now(),
            updated_at = now()
        """
    ).format(columns=columns_sql, values=values_sql, update_set=update_set)
    params: list[object] = []
    for r in records:
        params.extend(getattr(r, c) for c in _ESTABLISHMENT_COLUMNS)
    with conn.cursor() as cur:
        cur.execute(query, params)


_RATING_CHANGE_COLUMNS = (
    "fhrs_id",
    "previous_rating_value",
    "new_rating_value",
    "previous_rating_date",
    "new_rating_date",
    "previous_new_rating_pending",
    "new_new_rating_pending",
    "previous_hygiene_score",
    "new_hygiene_score",
    "previous_structural_score",
    "new_structural_score",
    "previous_confidence_score",
    "new_confidence_score",
    "ingestion_run_id",
)


def _bulk_insert_rating_changes(conn: psycopg.Connection, changes: Sequence[dict[str, object]]) -> None:
    # Prisma's @default(uuid()) is generated by Prisma Client itself, not a
    # database-level DEFAULT — raw SQL inserts (this ingestor never uses
    # Prisma Client) must supply the id explicitly or hit a NOT NULL
    # violation on the primary key.
    columns = ("id", *_RATING_CHANGE_COLUMNS)
    row_placeholder = "(" + ",".join(["%s"] * len(columns)) + ")"
    values_sql = sql.SQL(", ").join(sql.SQL(row_placeholder) for _ in changes)
    columns_sql = sql.SQL(", ").join(sql.Identifier(c) for c in columns)
    query = sql.SQL("INSERT INTO rating_changes ({columns}) VALUES {values}").format(
        columns=columns_sql, values=values_sql
    )
    params: list[object] = []
    for change in changes:
        params.append(str(uuid.uuid4()))
        params.extend(change[c] for c in _RATING_CHANGE_COLUMNS)
    with conn.cursor() as cur:
        cur.execute(query, params)


def mark_stale(conn: psycopg.Connection, local_authority_code: str, extract_date: date) -> int:
    """Mark establishments of this authority inactive if they were not part
    of the just-completed successful import (i.e. their source_extract_date
    is older than this run's). Only call this after a full success."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE establishments
            SET is_active = false, updated_at = now()
            WHERE local_authority_code = %s AND is_active = true AND source_extract_date < %s
            """,
            (local_authority_code, extract_date),
        )
        return cur.rowcount


# --------------------------------------------------------------------------
# ingestion_runs
# --------------------------------------------------------------------------


def create_ingestion_run(
    conn: psycopg.Connection,
    *,
    workflow_run_id: str | None = None,
    git_sha: str | None = None,
) -> str:
    # Prisma's @default(uuid()) is generated by Prisma Client itself, not a
    # database-level DEFAULT — raw SQL inserts (this ingestor never uses
    # Prisma Client) must supply the id explicitly or hit a NOT NULL
    # violation on the primary key.
    run_id = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ingestion_runs (id, status, workflow_run_id, git_sha)
            VALUES (%s, 'RUNNING', %s, %s)
            """,
            (run_id, workflow_run_id, git_sha),
        )
        return run_id


def update_ingestion_run(conn: psycopg.Connection, run_id: str, **fields: object) -> None:
    if not fields:
        return
    set_sql = sql.SQL(", ").join(
        sql.SQL("{col} = %s").format(col=sql.Identifier(k)) for k in fields
    )
    query = sql.SQL("UPDATE ingestion_runs SET {set_sql} WHERE id = %s").format(set_sql=set_sql)
    params = [*fields.values(), run_id]
    with conn.cursor() as cur:
        cur.execute(query, params)


def get_latest_ingestion_run(conn: psycopg.Connection) -> dict[str, object] | None:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 1")
        return cur.fetchone()


# --------------------------------------------------------------------------
# verify / cleanup
# --------------------------------------------------------------------------


def check_connectivity(conn: psycopg.Connection) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT 1")
        row = cur.fetchone()
        return row is not None and row[0] == 1


def count_establishments(conn: psycopg.Connection) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM establishments")
        row = cur.fetchone()
        return int(row[0]) if row else 0


def count_orphaned_rating_changes(conn: psycopg.Connection) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT count(*) FROM rating_changes rc
            LEFT JOIN establishments e ON e.fhrs_id = rc.fhrs_id
            WHERE e.fhrs_id IS NULL
            """
        )
        row = cur.fetchone()
        return int(row[0]) if row else 0


def count_orphaned_establishments(conn: psycopg.Connection) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT count(*) FROM establishments e
            LEFT JOIN local_authorities la ON la.code = e.local_authority_code
            WHERE la.code IS NULL
            """
        )
        row = cur.fetchone()
        return int(row[0]) if row else 0


def cleanup_old_rating_changes(conn: psycopg.Connection, retain_days: int) -> int:
    """Delete rating_changes older than `retain_days`. Opt-in only — callers
    must pass an explicit positive retention window; there is no default
    deletion policy."""
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM rating_changes WHERE changed_at < now() - (%s * INTERVAL '1 day')",
            (retain_days,),
        )
        return cur.rowcount
