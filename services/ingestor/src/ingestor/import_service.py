"""Orchestration for `discover`, `import-authority`, and `import-all`.

Batches XML rows into groups of `batch_size` and upserts each batch inside
its own transaction, so a failure partway through a large file rolls back
only the in-flight batch — previously committed batches (and any prior
successful authority imports) are never lost or rolled back. Staleness
(`is_active=false`) is only applied after a given authority's *entire* file
has been parsed and committed successfully.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date
from typing import cast

import httpx
import psycopg
import structlog

from ingestor import db
from ingestor.config import FSA_API_BASE_URL
from ingestor.discovery import fetch_authorities, fetch_xml_file, find_authority
from ingestor.models import DiscoveryAuthority, EstablishmentRecord
from ingestor.xml_parser import RejectedRow, XmlHeader, XmlParseError, parse_establishment_file

logger = structlog.get_logger(__name__)


def is_unchanged(last_extract_date: date | None, candidate_date: date | None, *, force: bool) -> bool:
    """True if an import should be skipped as a no-op: we have a prior
    extract date on record, a candidate date to compare it to, `--force`
    was not requested, and the two dates match exactly."""
    if force:
        return False
    if last_extract_date is None or candidate_date is None:
        return False
    return last_extract_date == candidate_date


@dataclass
class ImportAuthorityResult:
    code: str
    skipped: bool = False
    changed: bool = False
    error: str | None = None
    rows_seen: int = 0
    rows_inserted: int = 0
    rows_updated: int = 0
    rows_rejected: int = 0
    rating_changes_created: int = 0
    source_extract_date: date | None = None
    stale_marked: int = 0


def discover(conn: psycopg.Connection, client: httpx.Client, base_url: str) -> list[DiscoveryAuthority]:
    """`ingestor discover`: fetch + upsert all authorities' metadata. Does not
    download any establishment XML file."""
    authorities = fetch_authorities(client, base_url)
    db.upsert_local_authorities(conn, authorities)
    conn.commit()
    logger.info("discover.completed", authority_count=len(authorities))
    return authorities


def import_authority(
    conn: psycopg.Connection,
    client: httpx.Client,
    code: str,
    *,
    authorities: list[DiscoveryAuthority] | None = None,
    force: bool = False,
    batch_size: int = 500,
    run_id: str | None = None,
    dry_run: bool = False,
    base_url: str = FSA_API_BASE_URL,
) -> ImportAuthorityResult:
    """`ingestor import-authority <code>`.

    `authorities` may be passed in by a caller (e.g. `import-all`) that has
    already fetched the discovery list once, to avoid refetching per
    authority.
    """
    result = ImportAuthorityResult(code=code)

    if authorities is None:
        authorities = fetch_authorities(client, base_url)
    authority = find_authority(authorities, code)
    if authority is None:
        result.error = f"unknown local authority code {code!r}"
        logger.error("import_authority.unknown_code", code=code)
        return result
    if not authority.file_name:
        result.error = "authority has no open-data file URL"
        logger.error("import_authority.no_file_url", code=code)
        return result

    existing = db.get_local_authority(conn, code)
    last_extract_date = cast("date | None", existing.get("last_extract_date")) if existing else None

    # Fast-path proxy check using the discovery API's LastPublishedDate before
    # downloading the (potentially large) XML file at all.
    proxy_date = authority.last_published_date_only
    if is_unchanged(last_extract_date, proxy_date, force=force):
        result.skipped = True
        # Close the implicit transaction the read above opened (autocommit
        # is off) — otherwise a full run's common case (most authorities
        # unchanged) leaves one read transaction open per skip, all the way
        # until something else finally commits.
        conn.commit()
        logger.info("import_authority.unchanged_proxy", code=code, extract_date=str(last_extract_date))
        return result

    try:
        xml_file = fetch_xml_file(client, authority.file_name)
    except httpx.HTTPError as exc:
        result.error = f"failed to download open-data file: {exc}"
        logger.error("import_authority.download_failed", code=code, error=str(exc))
        conn.rollback()
        return result

    try:
        with xml_file:
            gen = parse_establishment_file(xml_file)
            try:
                header = next(gen)
            except StopIteration:
                result.error = "empty XML file"
                conn.rollback()
                return result
            except XmlParseError as exc:
                result.error = f"malformed XML: {exc}"
                logger.error("import_authority.malformed_xml", code=code, error=str(exc))
                conn.rollback()
                return result
            assert isinstance(header, XmlHeader)

            if is_unchanged(last_extract_date, header.extract_date, force=force):
                result.skipped = True
                conn.commit()
                logger.info("import_authority.unchanged", code=code, extract_date=str(header.extract_date))
                return result

            result.source_extract_date = header.extract_date
            result.changed = True
            records_gen = cast("Iterable[EstablishmentRecord | RejectedRow]", gen)

            if dry_run:
                seen = 0
                rejected = 0
                for item in records_gen:
                    seen += 1
                    if isinstance(item, RejectedRow):
                        rejected += 1
                result.rows_seen = seen
                result.rows_rejected = rejected
                logger.info(
                    "import_authority.dry_run",
                    code=code,
                    rows_seen=seen,
                    rows_rejected=rejected,
                    extract_date=str(header.extract_date),
                )
                return result

            for batch in _batched_records(records_gen, batch_size, result):
                with conn.transaction():
                    batch_result = db.upsert_establishments_batch(conn, batch, run_id=run_id)
                # Under autocommit=False, an earlier plain read (e.g.
                # get_local_authority above) already left the connection
                # inside an open implicit transaction, so `with
                # conn.transaction():` here creates a SAVEPOINT, not a real
                # commit — everything stays uncommitted, and thus entirely
                # rollback-able by one later failure, until this explicit
                # commit actually flushes it. This is what the module
                # docstring's "each batch its own transaction" promise
                # depends on; without it every authority in a run shares one
                # unbounded transaction, which both defeats crash-safety and
                # can exceed CockroachDB's per-transaction lock-tracking
                # budget on a large authority file.
                conn.commit()
                result.rows_inserted += batch_result.inserted
                result.rows_updated += batch_result.updated
                result.rating_changes_created += len(batch_result.rating_changes)

            with conn.transaction():
                result.stale_marked = db.mark_stale(conn, code, header.extract_date)
                db.update_local_authority_extract_date(conn, code, header.extract_date)
            conn.commit()
    except XmlParseError as exc:
        result.error = f"malformed XML: {exc}"
        logger.error("import_authority.malformed_xml", code=code, error=str(exc))
        conn.rollback()
        return result
    except Exception as exc:  # noqa: BLE001 - a single authority's failure must not crash the batch
        result.error = str(exc)
        logger.error("import_authority.failed", code=code, error=str(exc))
        # Guarantee the connection is left clean (not INERROR/aborted) so
        # import_all can safely continue with the next authority on the
        # same connection — an in-flight batch's `with conn.transaction():`
        # rolls back its own scope, but leaves nothing to be sure of beyond
        # that without this.
        conn.rollback()
        return result

    logger.info(
        "import_authority.completed",
        code=code,
        rows_seen=result.rows_seen,
        rows_inserted=result.rows_inserted,
        rows_updated=result.rows_updated,
        rows_rejected=result.rows_rejected,
        rating_changes_created=result.rating_changes_created,
        stale_marked=result.stale_marked,
    )
    return result


def _batched_records(
    gen: Iterable[EstablishmentRecord | RejectedRow],
    batch_size: int,
    result: ImportAuthorityResult,
) -> Iterable[list[EstablishmentRecord]]:
    batch: list[EstablishmentRecord] = []
    for item in gen:
        result.rows_seen += 1
        if isinstance(item, RejectedRow):
            result.rows_rejected += 1
            logger.warning(
                "import_authority.row_rejected",
                fhrs_id=item.fhrs_id,
                reason=item.reason,
                index=item.index,
            )
            continue
        batch.append(item)
        if len(batch) >= batch_size:
            yield batch
            batch = []
    if batch:
        yield batch


@dataclass
class ImportAllResult:
    local_authorities_checked: int = 0
    local_authorities_changed: int = 0
    rows_seen: int = 0
    rows_inserted: int = 0
    rows_updated: int = 0
    rows_rejected: int = 0
    rating_changes_created: int = 0
    failed_codes: list[str] = field(default_factory=list)
    skipped_codes: list[str] = field(default_factory=list)
    per_authority: list[ImportAuthorityResult] = field(default_factory=list)
    source_extract_date: date | None = None


def import_all(
    conn: psycopg.Connection,
    client: httpx.Client,
    *,
    base_url: str,
    force: bool = False,
    only_codes: list[str] | None = None,
    batch_size: int = 500,
    run_id: str | None = None,
    dry_run: bool = False,
) -> ImportAllResult:
    """`ingestor import-all`: discover, then import every (or selected)
    authority, aggregating counts for a single ingestion_runs row."""
    authorities = discover(conn, client, base_url) if not dry_run else fetch_authorities(client, base_url)
    if only_codes:
        wanted = set(only_codes)
        authorities = [a for a in authorities if a.code in wanted]

    out = ImportAllResult()
    for authority in authorities:
        out.local_authorities_checked += 1
        r = import_authority(
            conn,
            client,
            authority.code,
            authorities=authorities,
            force=force,
            batch_size=batch_size,
            run_id=run_id,
            dry_run=dry_run,
        )
        out.per_authority.append(r)
        if r.error:
            out.failed_codes.append(authority.code)
            continue
        if r.skipped:
            out.skipped_codes.append(authority.code)
            continue
        out.local_authorities_changed += 1
        out.rows_seen += r.rows_seen
        out.rows_inserted += r.rows_inserted
        out.rows_updated += r.rows_updated
        out.rows_rejected += r.rows_rejected
        out.rating_changes_created += r.rating_changes_created
        if r.source_extract_date is not None:
            out.source_extract_date = r.source_extract_date

    logger.info(
        "import_all.completed",
        checked=out.local_authorities_checked,
        changed=out.local_authorities_changed,
        failed=len(out.failed_codes),
        skipped=len(out.skipped_codes),
        rows_seen=out.rows_seen,
        rows_inserted=out.rows_inserted,
        rows_updated=out.rows_updated,
        rows_rejected=out.rows_rejected,
        rating_changes_created=out.rating_changes_created,
    )
    return out
