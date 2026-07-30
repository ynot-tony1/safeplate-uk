"""Typer CLI: `python -m ingestor <command>`."""

from __future__ import annotations

import os
from datetime import UTC, date, datetime

import httpx
import psycopg
import typer

from ingestor import db, import_service, metrics
from ingestor.config import get_settings
from ingestor.logging import configure_logging, get_logger

app = typer.Typer(no_args_is_help=True, add_completion=False, help=__doc__)

DatabaseUrlOption = typer.Option(
    None, "--database-url", help="Override INGEST_DATABASE_URL for this invocation."
)


def _make_client(timeout: float) -> httpx.Client:
    return httpx.Client(timeout=timeout, follow_redirects=True)


def _resolve_dsn(database_url: str | None) -> str:
    settings = get_settings()
    try:
        return settings.resolve_database_url(database_url)
    except ValueError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(code=2) from exc


def _init_logging() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)


@app.callback()
def main() -> None:
    _init_logging()


@app.command()
def discover(database_url: str | None = DatabaseUrlOption) -> None:
    """Fetch the current FSA authorities list and upsert local_authorities.
    Does not download any establishment XML."""
    logger = get_logger(__name__)
    dsn = _resolve_dsn(database_url)
    settings = get_settings()
    with db.connect(dsn) as conn, _make_client(settings.http_timeout_seconds) as client:
        authorities = import_service.discover(conn, client, settings.fsa_api_base_url)
    typer.echo(f"Discovered {len(authorities)} local authorities.")
    for a in sorted(authorities, key=lambda a: a.code)[:20]:
        typer.echo(f"  {a.code}\t{a.scheme_type}\t{a.name} ({a.region_name})")
    if len(authorities) > 20:
        typer.echo(f"  ... and {len(authorities) - 20} more.")
    logger.info("cli.discover.done", count=len(authorities))


@app.command("import-authority")
def import_authority_cmd(
    code: str = typer.Argument(..., help="Local authority code, e.g. 197"),
    force: bool = typer.Option(False, "--force", help="Re-import even if extract date is unchanged."),
    batch_size: int = typer.Option(1000, "--batch-size", min=1, max=10_000),
    dry_run: bool = typer.Option(False, "--dry-run", help="Validate only; write nothing."),
    database_url: str | None = DatabaseUrlOption,
) -> None:
    """Import (or re-import) one local authority's current open-data file."""
    logger = get_logger(__name__)
    dsn = _resolve_dsn(database_url)
    settings = get_settings()
    with db.connect(dsn) as conn, _make_client(settings.http_timeout_seconds) as client:
        result = import_service.import_authority(
            conn,
            client,
            code,
            force=force,
            batch_size=batch_size,
            dry_run=dry_run,
            base_url=settings.fsa_api_base_url,
        )
    if result.error:
        typer.echo(f"FAILED [{code}]: {result.error}", err=True)
        logger.error("cli.import_authority.failed", code=code, error=result.error)
        raise typer.Exit(code=1)
    if result.skipped:
        typer.echo(f"No change for {code} (extract date unchanged); skipped.")
        return
    typer.echo(
        f"{code}: seen={result.rows_seen} inserted={result.rows_inserted} "
        f"updated={result.rows_updated} rejected={result.rows_rejected} "
        f"rating_changes={result.rating_changes_created} stale_marked={result.stale_marked} "
        f"extract_date={result.source_extract_date}"
    )


@app.command("import-all")
def import_all_cmd(
    only_changed: bool = typer.Option(
        True,
        "--only-changed/--force",
        help="Default --only-changed: skip authorities whose extract date is unchanged. "
        "--force: re-import every authority regardless of extract date.",
    ),
    authorities_opt: str | None = typer.Option(
        None, "--authorities", help="Comma-separated list of authority codes to restrict to."
    ),
    batch_size: int = typer.Option(1000, "--batch-size", min=1, max=10_000),
    dry_run: bool = typer.Option(False, "--dry-run"),
    database_url: str | None = DatabaseUrlOption,
) -> None:
    """Discover then import every (or selected) local authority, recording
    one ingestion_runs row for the whole batch."""
    logger = get_logger(__name__)
    dsn = _resolve_dsn(database_url)
    settings = get_settings()
    only_codes = _parse_codes(authorities_opt)
    force = not only_changed

    with db.connect(dsn) as conn, _make_client(settings.http_timeout_seconds) as client:
        run_id = None
        if not dry_run:
            run_id = db.create_ingestion_run(
                conn, workflow_run_id=os.environ.get("GITHUB_RUN_ID"), git_sha=os.environ.get("GITHUB_SHA")
            )
            conn.commit()

        try:
            result = import_service.import_all(
                conn,
                client,
                base_url=settings.fsa_api_base_url,
                force=force,
                only_codes=only_codes,
                batch_size=batch_size,
                run_id=run_id,
                dry_run=dry_run,
            )
            status = _status_for(result)
            error_summary = _error_summary(result)
        except Exception as exc:  # noqa: BLE001 - must still record FAILED status
            conn.rollback()
            result = import_service.ImportAllResult()
            status = "FAILED"
            error_summary = str(exc)
            logger.error("cli.import_all.exception", error=str(exc))

        if run_id is not None:
            db.update_ingestion_run(
                conn,
                run_id,
                status=status,
                source_extract_date=result.source_extract_date,
                local_authorities_checked=result.local_authorities_checked,
                local_authorities_changed=result.local_authorities_changed,
                rows_seen=result.rows_seen,
                rows_inserted=result.rows_inserted,
                rows_updated=result.rows_updated,
                rating_changes_created=result.rating_changes_created,
                rows_rejected=result.rows_rejected,
                completed_at=datetime.now(tz=UTC),
                error_summary=error_summary,
            )
            conn.commit()

    _print_import_all_summary(result)
    logger.info("cli.import_all.done", checked=result.local_authorities_checked, status=status)
    if status == "FAILED":
        raise typer.Exit(code=1)


def _parse_codes(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    return [c.strip() for c in raw.split(",") if c.strip()]


def _status_for(result: import_service.ImportAllResult) -> str:
    if not result.failed_codes:
        return "SUCCESS"
    if result.local_authorities_changed > 0 or result.skipped_codes:
        return "PARTIAL"
    return "FAILED"


def _error_summary(result: import_service.ImportAllResult) -> str | None:
    if not result.failed_codes:
        return None
    return f"{len(result.failed_codes)} authorities failed: {', '.join(result.failed_codes[:20])}"


def _print_import_all_summary(result: import_service.ImportAllResult) -> None:
    typer.echo(
        f"import-all: checked={result.local_authorities_checked} "
        f"changed={result.local_authorities_changed} "
        f"skipped={len(result.skipped_codes)} failed={len(result.failed_codes)}\n"
        f"  rows_seen={result.rows_seen} inserted={result.rows_inserted} "
        f"updated={result.rows_updated} rejected={result.rows_rejected} "
        f"rating_changes={result.rating_changes_created}"
    )
    if result.failed_codes:
        typer.echo(f"Failed authorities: {', '.join(result.failed_codes)}", err=True)


@app.command("refresh-metrics")
def refresh_metrics_cmd(
    as_of: str | None = typer.Option(None, "--as-of", help="Date YYYY-MM-DD; defaults to today."),
    database_url: str | None = DatabaseUrlOption,
) -> None:
    """Recompute and upsert daily_metrics for `as_of` (default: today)."""
    logger = get_logger(__name__)
    dsn = _resolve_dsn(database_url)
    as_of_date = date.fromisoformat(as_of) if as_of else date.today()
    with db.connect(dsn) as conn, conn.transaction():
        result = metrics.refresh_metrics(conn, as_of_date)
    typer.echo(f"refresh-metrics: wrote {result.scopes_written} scope rows for {as_of_date}.")
    logger.info("cli.refresh_metrics.done", scopes=result.scopes_written)


@app.command()
def verify(database_url: str | None = DatabaseUrlOption) -> None:
    """Read-only sanity checks. Exits non-zero with a clear message if
    anything looks wrong."""
    logger = get_logger(__name__)
    dsn = _resolve_dsn(database_url)
    problems: list[str] = []
    try:
        conn = db.connect(dsn)
    except psycopg.Error as exc:
        typer.echo(f"FAIL: could not connect to database ({exc.__class__.__name__})", err=True)
        logger.error("cli.verify.connect_failed", error_type=exc.__class__.__name__)
        raise typer.Exit(code=1) from exc

    with conn:
        if not db.check_connectivity(conn):
            typer.echo("FAIL: database not reachable (SELECT 1 did not return 1)", err=True)
            raise typer.Exit(code=1)

        establishment_count = db.count_establishments(conn)
        latest_run = db.get_latest_ingestion_run(conn)
        orphaned_rating_changes = db.count_orphaned_rating_changes(conn)
        orphaned_establishments = db.count_orphaned_establishments(conn)

    if latest_run is not None and establishment_count == 0:
        problems.append("an ingestion_runs row exists but establishments is empty")
    if orphaned_rating_changes:
        problems.append(f"{orphaned_rating_changes} orphaned rating_changes rows (no matching establishment)")
    if orphaned_establishments:
        problems.append(f"{orphaned_establishments} establishments reference an unknown local_authority_code")
    if latest_run is not None and latest_run.get("status") == "FAILED":
        problems.append(f"latest ingestion_runs row (id={latest_run.get('id')}) has status FAILED")

    typer.echo(f"establishments: {establishment_count}")
    if latest_run is not None:
        typer.echo(
            f"latest ingestion run: id={latest_run.get('id')} status={latest_run.get('status')} "
            f"started_at={latest_run.get('started_at')}"
        )
    else:
        typer.echo("latest ingestion run: none yet")

    if problems:
        for p in problems:
            typer.echo(f"PROBLEM: {p}", err=True)
        logger.error("cli.verify.problems", problems=problems)
        raise typer.Exit(code=1)

    typer.echo("OK: all checks passed.")
    logger.info("cli.verify.ok")


@app.command()
def cleanup(
    retain_changes_days: int | None = typer.Option(
        None,
        "--retain-changes-days",
        help="If set, delete rating_changes older than N days. Default: keep everything (no-op).",
    ),
    database_url: str | None = DatabaseUrlOption,
) -> None:
    """Safe maintenance. No-op unless an explicit retention policy is given."""
    logger = get_logger(__name__)
    if retain_changes_days is None:
        typer.echo("cleanup: no retention policy configured; nothing to do (safe no-op).")
        logger.info("cli.cleanup.noop")
        return
    if retain_changes_days <= 0:
        typer.echo("--retain-changes-days must be a positive integer", err=True)
        raise typer.Exit(code=2)
    dsn = _resolve_dsn(database_url)
    with db.connect(dsn) as conn, conn.transaction():
        deleted = db.cleanup_old_rating_changes(conn, retain_changes_days)
    typer.echo(f"cleanup: deleted {deleted} rating_changes rows older than {retain_changes_days} days.")
    logger.info("cli.cleanup.done", deleted=deleted, retain_days=retain_changes_days)


@app.command()
def run(
    force: bool = typer.Option(False, "--force"),
    authorities_opt: str | None = typer.Option(None, "--authorities"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    batch_size: int = typer.Option(1000, "--batch-size", min=1, max=10_000),
    database_url: str | None = DatabaseUrlOption,
) -> None:
    """Orchestration entrypoint for the scheduled GitHub Actions workflow:
    import-all, then refresh-metrics, recording a single ingestion_runs row.
    """
    logger = get_logger(__name__)
    dsn = _resolve_dsn(database_url)
    settings = get_settings()
    only_codes = _parse_codes(authorities_opt)

    with db.connect(dsn) as conn, _make_client(settings.http_timeout_seconds) as client:
        run_id = None
        if not dry_run:
            run_id = db.create_ingestion_run(
                conn, workflow_run_id=os.environ.get("GITHUB_RUN_ID"), git_sha=os.environ.get("GITHUB_SHA")
            )
            conn.commit()

        try:
            result = import_service.import_all(
                conn,
                client,
                base_url=settings.fsa_api_base_url,
                force=force,
                only_codes=only_codes,
                batch_size=batch_size,
                run_id=run_id,
                dry_run=dry_run,
            )
            metrics_result = None
            if not dry_run:
                with conn.transaction():
                    metrics_result = metrics.refresh_metrics(conn, date.today())
            status = _status_for(result)
            error_summary = _error_summary(result)
        except Exception as exc:  # noqa: BLE001 - must still record FAILED status
            conn.rollback()
            result = import_service.ImportAllResult()
            metrics_result = None
            status = "FAILED"
            error_summary = str(exc)
            logger.error("cli.run.exception", error=str(exc))

        if run_id is not None:
            db.update_ingestion_run(
                conn,
                run_id,
                status=status,
                source_extract_date=result.source_extract_date,
                local_authorities_checked=result.local_authorities_checked,
                local_authorities_changed=result.local_authorities_changed,
                rows_seen=result.rows_seen,
                rows_inserted=result.rows_inserted,
                rows_updated=result.rows_updated,
                rating_changes_created=result.rating_changes_created,
                rows_rejected=result.rows_rejected,
                completed_at=datetime.now(tz=UTC),
                error_summary=error_summary,
            )
            conn.commit()

    _print_run_summary(run_id, status, result, metrics_result, dry_run=dry_run)
    logger.info("cli.run.done", status=status, run_id=run_id)
    if status == "FAILED":
        raise typer.Exit(code=1)


def _print_run_summary(
    run_id: str | None,
    status: str,
    result: import_service.ImportAllResult,
    metrics_result: metrics.MetricsResult | None,
    *,
    dry_run: bool,
) -> None:
    lines = [
        "## SafePlate UK ingestion run summary",
        "",
        f"- Run ID: `{run_id or '(dry-run, not recorded)'}`",
        f"- Status: **{status}**",
        f"- Dry run: {dry_run}",
        f"- Local authorities checked: {result.local_authorities_checked}",
        f"- Local authorities changed: {result.local_authorities_changed}",
        f"- Rows seen: {result.rows_seen}",
        f"- Rows inserted: {result.rows_inserted}",
        f"- Rows updated: {result.rows_updated}",
        f"- Rows rejected: {result.rows_rejected}",
        f"- Rating changes created: {result.rating_changes_created}",
        f"- Failed authorities: {len(result.failed_codes)}",
    ]
    if result.failed_codes:
        lines.append(f"  - {', '.join(result.failed_codes)}")
    if metrics_result is not None:
        lines.append(f"- Metrics scope rows written: {metrics_result.scopes_written}")
    summary = "\n".join(lines)
    typer.echo(summary)

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        try:
            with open(summary_path, "a", encoding="utf-8") as f:
                f.write(summary + "\n")
        except OSError:
            pass


if __name__ == "__main__":  # pragma: no cover
    app()
