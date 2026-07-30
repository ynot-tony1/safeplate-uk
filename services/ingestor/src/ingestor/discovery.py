"""Source discovery against the official FSA FHRS/FHIS open-data API.

Only the metadata API is used here (never FSA's HTML search pages). See
`GET /authorities` — confirmed live at https://api.ratings.food.gov.uk on
2026-07-30 with headers `x-api-version: 2` / `accept: application/json`.
"""

from __future__ import annotations

import tempfile
from typing import IO

import httpx
import structlog
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from ingestor.models import DiscoveryAuthority, DiscoveryResponse

logger = structlog.get_logger(__name__)

AUTHORITIES_PATH = "/authorities"


def build_headers() -> dict[str, str]:
    return {"x-api-version": "2", "accept": "application/json"}


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError | httpx.TimeoutException):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    return False


@retry(
    reraise=True,
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=30),
    retry=retry_if_exception_type((httpx.TransportError, httpx.TimeoutException, httpx.HTTPStatusError)),
)
def _get_with_retry(client: httpx.Client, url: str) -> httpx.Response:
    response = client.get(url, headers=build_headers())
    if response.status_code >= 500:
        response.raise_for_status()
    return response


def fetch_authorities(client: httpx.Client, base_url: str) -> list[DiscoveryAuthority]:
    """Fetch the full list of participating local authorities and their
    current open-data file metadata."""
    url = f"{base_url.rstrip('/')}{AUTHORITIES_PATH}"
    response = _get_with_retry(client, url)
    response.raise_for_status()
    payload = DiscoveryResponse.model_validate(response.json())
    logger.info("discovery.fetched", authority_count=len(payload.authorities))
    return payload.authorities


def find_authority(authorities: list[DiscoveryAuthority], code: str) -> DiscoveryAuthority | None:
    for authority in authorities:
        if authority.code == code:
            return authority
    return None


# Spill to disk past 8MB so downloading a large authority's XML file never
# holds the whole document as an in-memory bytes object.
_SPOOL_MAX_SIZE = 8 * 1024 * 1024


@retry(
    reraise=True,
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=20),
    retry=retry_if_exception_type((httpx.TransportError, httpx.TimeoutException, httpx.HTTPStatusError)),
)
def fetch_xml_file(client: httpx.Client, url: str) -> IO[bytes]:
    """Stream-download an authority's open-data XML file to a spooled
    temp file (rewound, ready to read) rather than buffering it whole in a
    `bytes` object. Raises on transport errors / non-2xx status, retried
    with exponential backoff for transient failures."""
    spooled: IO[bytes] = tempfile.SpooledTemporaryFile(max_size=_SPOOL_MAX_SIZE, mode="w+b")  # noqa: SIM115
    with client.stream("GET", url, headers={"accept": "application/xml"}) as response:
        response.raise_for_status()
        for chunk in response.iter_bytes():
            spooled.write(chunk)
    spooled.seek(0)
    return spooled
