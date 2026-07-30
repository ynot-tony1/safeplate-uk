#!/usr/bin/env python3
"""One-time CockroachDB Cloud bootstrap for SafePlate UK.

Reads COCKROACH_BOOTSTRAP_URL from the environment ONLY — never accepts it
as a CLI argument (which would leak into shell history / process listings)
and never prints, logs, or writes it anywhere. Run this once, then unset the
variable.

Usage:
    export COCKROACH_BOOTSTRAP_URL='postgresql://...'
    python3 scripts/bootstrap_cockroachdb.py
    unset COCKROACH_BOOTSTRAP_URL

Requires: psycopg[binary] (installed on demand into a throwaway venv is fine),
and optionally the `gh` CLI (authenticated) to push the resulting
INGEST_DATABASE_URL / MIGRATION_DATABASE_URL straight into GitHub secrets.
The DATABASE_URL for Vercel is written to a 0600 file under .secrets/ (which
is gitignored) for the separate Vercel-linking step to consume and delete.
"""

from __future__ import annotations

import os
import secrets
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse, urlunparse

DATABASE_NAME = "food_hygiene"
SECRETS_DIR = Path(__file__).resolve().parent.parent / ".secrets"

ROLES = {
    "food_migrator": "DDL + full DML on food_hygiene — used only by prisma migrate deploy",
    "food_ingestor": "DML (select/insert/update) on establishment-related tables — used by the ingestor",
    "food_app": "SELECT only — used by the Next.js app on Vercel",
}


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def get_bootstrap_url() -> str:
    url = os.environ.get("COCKROACH_BOOTSTRAP_URL")
    if not url:
        fail(
            "COCKROACH_BOOTSTRAP_URL is not set. Export it in your terminal "
            "(never paste it into chat) and re-run this script."
        )
    parsed = urlparse(url)
    if parsed.scheme not in ("postgres", "postgresql"):
        fail("COCKROACH_BOOTSTRAP_URL does not look like a postgres connection string.")
    if "sslmode=verify-full" not in url and "sslmode=verify-ca" not in url:
        fail(
            "Refusing to bootstrap without a verified TLS connection "
            "(expected sslmode=verify-full or verify-ca in the connection string)."
        )
    return url


def build_url(base_url: str, user: str, password: str, database: str | None = None) -> str:
    parsed = urlparse(base_url)
    netloc = f"{user}:{password}@{parsed.hostname}"
    if parsed.port:
        netloc += f":{parsed.port}"
    path = f"/{database}" if database else parsed.path
    return urlunparse(parsed._replace(netloc=netloc, path=path))


def redact(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.username}:***@{parsed.hostname}:{parsed.port}{parsed.path}"


def push_to_github_secret(name: str, value: str) -> bool:
    try:
        result = subprocess.run(
            ["gh", "secret", "set", name],
            input=value,
            text=True,
            capture_output=True,
            check=False,
        )
    except FileNotFoundError:
        print(f"  gh CLI not found — skipped setting {name}. Set it manually.")
        return False
    if result.returncode != 0:
        print(f"  WARNING: failed to set GitHub secret {name}: {result.stderr.strip()}")
        return False
    print(f"  GitHub secret {name} set.")
    return True


def main() -> None:
    bootstrap_url = get_bootstrap_url()

    try:
        import psycopg
    except ImportError:
        fail("psycopg is not installed. Run: pip install 'psycopg[binary]'")
        return

    print("Connecting with verified TLS...")
    with psycopg.connect(bootstrap_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            if cur.fetchone() != (1,):
                fail("SELECT 1 sanity check failed.")
            print("  SELECT 1 OK.")

            print(f"Ensuring database '{DATABASE_NAME}' exists...")
            cur.execute(f"CREATE DATABASE IF NOT EXISTS {DATABASE_NAME}")

            generated: dict[str, str] = {}
            for role in ROLES:
                password = secrets.token_urlsafe(32)
                generated[role] = password
                cur.execute(f"CREATE USER IF NOT EXISTS {role} WITH PASSWORD %s", (password,))
                cur.execute(f"ALTER USER {role} WITH PASSWORD %s", (password,))
                print(f"  User '{role}' created/updated.")

        # No tables exist yet (migrations haven't run) — grants that name
        # specific tables would fail with "relation does not exist". Instead,
        # grant on the database/schema now, and set default privileges FOR
        # ROLE food_migrator so that every table it creates later (via
        # `prisma migrate deploy`) automatically carries the right grants for
        # food_ingestor and food_app with no further action needed.
        with psycopg.connect(bootstrap_url, autocommit=True) as db_conn:
            with db_conn.cursor() as cur:
                cur.execute(f"USE {DATABASE_NAME}")
                # CockroachDB, like pre-15 Postgres, grants CREATE on the
                # `public` schema to the implicit PUBLIC pseudo-role by
                # default — every user could otherwise create tables
                # regardless of their explicit grants. Revoke it so only
                # food_migrator (granted ALL below) can run DDL.
                cur.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
                cur.execute("GRANT ALL ON DATABASE food_hygiene TO food_migrator")
                cur.execute("GRANT ALL ON SCHEMA public TO food_migrator")
                cur.execute("GRANT CONNECT ON DATABASE food_hygiene TO food_ingestor")
                cur.execute("GRANT CONNECT ON DATABASE food_hygiene TO food_app")
                cur.execute(
                    "ALTER DEFAULT PRIVILEGES FOR ROLE food_migrator IN SCHEMA public "
                    "GRANT SELECT, INSERT, UPDATE ON TABLES TO food_ingestor"
                )
                cur.execute(
                    "ALTER DEFAULT PRIVILEGES FOR ROLE food_migrator IN SCHEMA public "
                    "GRANT SELECT ON TABLES TO food_app"
                )
                # Belt-and-suspenders: also grant on whatever tables happen to
                # already exist in case this script is re-run after migrations.
                cur.execute("GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO food_ingestor")
                cur.execute("GRANT SELECT ON ALL TABLES IN SCHEMA public TO food_app")
                print("  Grants applied (least privilege per role).")

    urls = {role: build_url(bootstrap_url, role, pw, DATABASE_NAME) for role, pw in generated.items()}

    # No tables exist yet at bootstrap time, so DML grants can't be fully
    # exercised until after `prisma migrate deploy` runs (see task: apply
    # migrations). What we CAN verify now is that only food_migrator has DDL
    # rights — that boundary doesn't depend on any table existing.
    print("\nVerifying each role's real permissions (pre-migration checks)...")
    with psycopg.connect(urls["food_app"]) as c, c.cursor() as cur:
        cur.execute("SELECT 1")
        try:
            cur.execute("CREATE TABLE _permission_probe_app (id INT)")
            fail("food_app was able to run DDL — least-privilege grant is broken.")
        except Exception:
            c.rollback()
            print("  food_app: SELECT works, DDL correctly denied.")

    with psycopg.connect(urls["food_ingestor"]) as c, c.cursor() as cur:
        cur.execute("SELECT 1")
        try:
            cur.execute("CREATE TABLE _permission_probe_ingestor (id INT)")
            fail("food_ingestor was able to run DDL — least-privilege grant is broken.")
        except Exception:
            c.rollback()
            print("  food_ingestor: connects fine, DDL correctly denied.")

    with psycopg.connect(urls["food_migrator"]) as c, c.cursor() as cur:
        cur.execute("CREATE TABLE IF NOT EXISTS _permission_probe (id INT)")
        cur.execute("DROP TABLE _permission_probe")
        print("  food_migrator: DDL works as expected.")
        print(
            "  NOTE: food_ingestor/food_app DML grants are set via ALTER DEFAULT "
            "PRIVILEGES and will apply automatically once food_migrator creates "
            "the schema — re-verify SELECT/INSERT/UPDATE after migrations run."
        )

    # Write local fallback files FIRST, before attempting any network push —
    # so a failed `gh secret set` (e.g. no remote yet) never loses a
    # generated password permanently. Each file is deleted once the value
    # has been successfully delivered to its real destination.
    SECRETS_DIR.mkdir(exist_ok=True)
    fallback_paths = {}
    for role, url in urls.items():
        path = SECRETS_DIR / f"{role}_url.txt"
        path.write_text(url)
        os.chmod(path, 0o600)
        fallback_paths[role] = path

    print("\nPushing secrets...")
    if push_to_github_secret("INGEST_DATABASE_URL", urls["food_ingestor"]):
        fallback_paths["food_ingestor"].unlink()
    if push_to_github_secret("MIGRATION_DATABASE_URL", urls["food_migrator"]):
        fallback_paths["food_migrator"].unlink()

    app_secret_path = fallback_paths["food_app"]
    print(
        f"\nDATABASE_URL for the food_app role written to {app_secret_path} (0600, gitignored).\n"
        "Use it with `vercel env add DATABASE_URL production` during Vercel linking, "
        "then delete the file."
    )

    print("\nDone. Summary (redacted):")
    for role, url in urls.items():
        print(f"  {role}: {redact(url)}  — {ROLES[role]}")
    print(
        "\nNow run: unset COCKROACH_BOOTSTRAP_URL"
        "\n(this script never printed the bootstrap password or the generated passwords)"
    )


if __name__ == "__main__":
    main()
