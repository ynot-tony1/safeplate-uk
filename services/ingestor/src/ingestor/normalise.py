"""Name and postcode normalisation helpers.

These back the `normalised_name` / `postcode_prefix` columns used for
prefix-search indexes in `establishments`.
"""

from __future__ import annotations

import re

_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
_WHITESPACE_RE = re.compile(r"\s+")
_UK_POSTCODE_RE = re.compile(r"^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$")


def normalise_name(name: str) -> str:
    """Lower-case, punctuation-stripped form of a business name for prefix search.

    e.g. "Compass Group UK & Ireland Ltd." -> "compass group uk ireland ltd"
    """
    lowered = name.strip().lower()
    collapsed = _NON_ALNUM_RE.sub(" ", lowered)
    return _WHITESPACE_RE.sub(" ", collapsed).strip()


def normalise_postcode(raw: str | None) -> tuple[str | None, str | None]:
    """Return (normalised_postcode, postcode_prefix) for a raw postcode string.

    Normalised form is upper-cased with a single space before the 3-character
    inward code (e.g. "sw1a1aa" -> "SW1A 1AA"). The prefix is the outward code
    (e.g. "SW1A"), used for postcode-prefix search.

    Returns (None, None) if the input is missing/blank or does not look like a
    plausible UK postcode (defensive: never raises).
    """
    if raw is None:
        return None, None
    compact = raw.strip().upper().replace(" ", "")
    if len(compact) < 5 or len(compact) > 8:
        return None, None
    outward, inward = compact[:-3], compact[-3:]
    normalised = f"{outward} {inward}"
    if not _UK_POSTCODE_RE.match(normalised):
        return None, None
    return normalised, outward
