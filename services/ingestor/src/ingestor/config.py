"""Runtime configuration.

Reads `INGEST_DATABASE_URL` from the environment (optionally a `.env` file
for local development). Never hardcode connection strings. Callers may
override the database URL via `--database-url`; that override is applied
on top of this settings object, not baked in here.
"""

from __future__ import annotations

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_BATCH_SIZE = 1000
"""Default upsert batch size. Chosen within the 500-2000 guidance range;
should be recalibrated against real CockroachDB Cloud performance once
production credentials/infrastructure exist — not verifiable in this
sandbox."""

FSA_API_BASE_URL = "https://api.ratings.food.gov.uk"
FSA_API_VERSION = "2"


class Settings(BaseSettings):
    """Process-wide settings, sourced from environment variables / .env."""

    model_config = SettingsConfigDict(
        env_prefix="INGEST_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: SecretStr | None = Field(default=None, alias="INGEST_DATABASE_URL")
    log_level: str = Field(default="info", alias="LOG_LEVEL")
    batch_size: int = Field(default=DEFAULT_BATCH_SIZE, ge=1, le=10_000)
    fsa_api_base_url: str = Field(default=FSA_API_BASE_URL)
    http_timeout_seconds: float = Field(default=30.0, gt=0)

    def resolve_database_url(self, override: str | None) -> str:
        """Return the effective database URL: CLI override wins, else env.

        Raises ValueError with no leakage of any partial connection string.
        """
        if override:
            return override
        if self.database_url is not None:
            return self.database_url.get_secret_value()
        raise ValueError(
            "No database URL configured. Set INGEST_DATABASE_URL or pass --database-url."
        )


def get_settings() -> Settings:
    return Settings()
