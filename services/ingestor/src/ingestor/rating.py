"""Defensive parsing/validation for FHRS/FHIS rating and score fields.

The `rating_value` / `rating_key` database columns are free-text (the FSA
scheme is not a strict enum across FHRS and FHIS), so we do not coerce
rating values into a closed set. Instead we validate that a value looks like
one of the documented shapes and normalise incidental whitespace, but always
prefer to pass through unrecognised-but-plausible text rather than reject a
whole row over a rating field FSA might extend later.
"""

from __future__ import annotations

import re

# Numeric FHRS ratings.
_FHRS_NUMERIC = {"0", "1", "2", "3", "4", "5"}

# Known non-numeric rating values across both schemes (case/space-insensitive).
# FHRS: Exempt, Awaiting Inspection, Awaiting Publication.
# FHIS: Pass, Improvement Required, Exempt, Awaiting Inspection, Awaiting Publication,
#       Pass and Eat Safe.
_KNOWN_TEXT_RATINGS = {
    "exempt",
    "awaitinginspection",
    "awaitingpublication",
    "awaitingpublication_regis",
    "pass",
    "improvementrequired",
    "passandeatsafe",
}

_WHITESPACE_RE = re.compile(r"\s+")

# Sane bounds for the three FHRS score components (documented values run
# 0-30 in practice; 0-100 gives headroom without accepting garbage).
SCORE_MIN = 0
SCORE_MAX = 100

# UK (incl. Scotland, NI, Channel Islands, Shetland/Orkney) bounding box, with
# a small margin. Used to reject clearly-wrong geocodes rather than to do
# precise geofencing.
UK_LAT_MIN, UK_LAT_MAX = 49.5, 61.1
UK_LON_MIN, UK_LON_MAX = -8.8, 2.1


def parse_rating_value(raw: str | None) -> str | None:
    """Return a cleaned rating value string, or None if blank/missing.

    Does not reject unrecognised text — only trims/collapses whitespace so
    downstream comparisons (e.g. change detection) are stable. Logging of
    unrecognised values is the caller's responsibility if desired.
    """
    if raw is None:
        return None
    cleaned = _WHITESPACE_RE.sub(" ", raw.strip())
    return cleaned or None


def is_known_rating_value(value: str) -> bool:
    """True if `value` matches a documented FHRS/FHIS rating shape."""
    if value in _FHRS_NUMERIC:
        return True
    key = _WHITESPACE_RE.sub("", value).lower()
    return key in _KNOWN_TEXT_RATINGS


def parse_score(raw: str | None) -> int | None:
    """Parse a Hygiene/Structural/ConfidenceInManagement score.

    Returns None (rather than raising) for missing, non-numeric, or
    out-of-range values so a single bad score never fails a whole row.
    """
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    try:
        value = int(text)
    except ValueError:
        return None
    if value < SCORE_MIN or value > SCORE_MAX:
        return None
    return value


def parse_bool(raw: str | None, *, default: bool = False) -> bool:
    """Parse an XML "True"/"False" string defensively, defaulting on failure."""
    if raw is None:
        return default
    text = raw.strip().lower()
    if text == "true":
        return True
    if text == "false":
        return False
    return default


def validate_uk_coordinates(longitude: float | None, latitude: float | None) -> bool:
    """True if both coordinates are present and within the UK bounding box."""
    if longitude is None or latitude is None:
        return False
    return UK_LON_MIN <= longitude <= UK_LON_MAX and UK_LAT_MIN <= latitude <= UK_LAT_MAX
