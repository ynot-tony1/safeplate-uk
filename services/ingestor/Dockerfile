# syntax=docker/dockerfile:1
FROM python:3.12-slim AS builder

# uv provides its own static binary; no need to pip-install it.
COPY --from=ghcr.io/astral-sh/uv:0.12.0 /uv /uvx /usr/local/bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

# Install dependencies first (layer caching), then copy the rest of the
# source and re-sync so the local `ingestor` package itself is installed.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev


FROM python:3.12-slim AS runtime

# python:3.12-slim ships without ca-certificates, so sslrootcert=system
# (used for verify-full CockroachDB Cloud connections, see db.py) would
# otherwise find an empty trust store and fail all TLS verification.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system ingestor && useradd --system --gid ingestor --create-home ingestor

COPY --from=builder --chown=ingestor:ingestor /app/.venv /app/.venv
COPY --from=builder --chown=ingestor:ingestor /app/src /app/src

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

WORKDIR /app
USER ingestor

ENTRYPOINT ["python", "-m", "ingestor"]
CMD ["--help"]
