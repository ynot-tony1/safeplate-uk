# SafePlate UK

Search, explore and analyse UK Food Hygiene Rating Scheme (FHRS) and Food
Hygiene Information Scheme (FHIS) data, sourced entirely from the Food
Standards Agency's official open-data files.

## Architecture

```
Food Standards Agency open-data files
                 |
                 v
     GitHub Actions scheduled workflow
                 |
                 v
       Dockerised Python ingestor
                 |
                 v
   CockroachDB Cloud: food_hygiene
                 |
                 v
      Next.js server-side data layer
                 |
                 v
         Next.js application
                 |
                 v
              Vercel
```

Once deployed, nothing in this system depends on any local machine staying
on: ingestion runs on a GitHub Actions schedule, the database is CockroachDB
Cloud, and the application is hosted on Vercel with deploys triggered by
GitHub pushes.

## Repository structure

```
safeplate-uk/
├── apps/web            Next.js App Router application
├── services/ingestor    Python ingestion service (Typer CLI, Dockerised)
├── packages/database     Prisma schema (CockroachDB) + generated client
├── packages/shared        Shared Zod schemas / validation / normalisation helpers
├── docs/                   Architecture, data sources, security, cost notes
├── scripts/                 One-off operational scripts (DB bootstrap, calibration)
└── .github/workflows/        CI, scheduled ingestion, production migrations
```

## Technology

- **Web**: Next.js (App Router), React, TypeScript (strict), Tailwind CSS,
  shadcn/ui, Recharts, Leaflet/React-Leaflet, Prisma (`provider = "cockroachdb"`),
  Zod, Vitest, Playwright.
- **Ingestion**: Python 3.12+, Psycopg 3, HTTPX, Pydantic, Typer, Tenacity,
  defusedxml (streaming, secure XML parsing), structlog, Pytest, Ruff, Mypy,
  Docker.

All dependency versions are pinned in committed lockfiles (`pnpm-lock.yaml`,
`services/ingestor/uv.lock`).

## Data source

This project imports only from the FSA's official FHRS/FHIS **open data
files** for full imports, and the official API for **source discovery**
(finding current per-authority file URLs and extract dates) and selective
lookups. It never scrapes `ratings.food.gov.uk`'s HTML search pages. No API
key is required for the core project. See `docs/data-sources.md` and the
in-app `/about/data` page for full detail on FHRS vs FHIS and data
limitations.

## Local development

```bash
pnpm install
docker compose up -d cockroachdb
pnpm db:generate
pnpm --filter @safeplate/database migrate:dev
pnpm dev
```

For the ingestor:

```bash
cd services/ingestor
uv sync
uv run python -m ingestor --help
```

## Security

- Production credentials are never stored in this repository or in chat —
  only in GitHub Actions secrets and Vercel project environment variables.
- Three least-privilege CockroachDB roles are used: `food_migrator` (DDL,
  migrations only), `food_ingestor` (read/write on establishment data only),
  `food_app` (read-only, used by the deployed web app — cannot run
  migrations or bulk-modify data).
- Production schema migrations are applied only via a manually-triggered
  `prisma migrate deploy` workflow — never `migrate reset` or an automatic
  destructive push.
- See `docs/security.md` for the full credential-handling policy.

## Status

See `docs/` for the calibration/cost report and rollout status as the
project progresses through ingestion calibration and full-dataset import
approval.
