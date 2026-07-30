"""Streaming parser for FHRS/FHIS open-data XML files.

Uses `defusedxml`'s hardened `iterparse` (no external entity resolution) so
we never load the whole document/DOM into memory: each `<EstablishmentDetail>`
element is processed and then discarded (detached from its parent) as soon
as it is read, which keeps memory roughly constant regardless of file size.

Real per-authority files inspected while building this parser (River Tees,
Isles of Scilly, Adur, Shetland Islands — fetched live from
https://ratings.food.gov.uk/OpenDataFiles/FHRS<code>en-GB.xml) confirmed:
  - root element `FHRSEstablishment`, `Header` with `ExtractDate`/`ItemCount`/
    `ReturnCode`, `EstablishmentCollection` of `EstablishmentDetail`.
  - `PostCode`, `AddressLine4`, and `Geocode` (Longitude/Latitude) are each
    genuinely optional — not present on every record.
  - `Scores` can be empty (`<Scores />`, seen throughout FHIS files).
  - `RatingValue`/`RatingKey` cover both numeric FHRS ("5", "fhrs_5_en-GB")
    and text FHRS/FHIS values ("AwaitingInspection", "Awaiting Inspection",
    "Exempt", "Pass", "Pass and Eat Safe", "Improvement Required").
  - `SchemeType` in the establishment record is the plain text "FHRS"/"FHIS"
    (distinct from the discovery API's numeric 1/2 SchemeType).
"""

from __future__ import annotations

import contextlib
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date
from typing import IO

from defusedxml.ElementTree import iterparse
from pydantic import ValidationError

from ingestor.models import EstablishmentRecord, XmlHeader

_HEADER_TAG = "Header"
_COLLECTION_TAG = "EstablishmentCollection"
_DETAIL_TAG = "EstablishmentDetail"
_SCORES_TAG = "Scores"
_GEOCODE_TAG = "Geocode"

# Child elements nested one level down that we flatten onto the raw dict.
_NESTED_CONTAINERS = (_SCORES_TAG, _GEOCODE_TAG)


@dataclass
class RejectedRow:
    """A single `<EstablishmentDetail>` that failed validation.

    Individually invalid rows are skipped/counted, never fatal to the file.
    """

    index: int
    reason: str
    fhrs_id: str | None = None


class XmlParseError(Exception):
    """Raised when the file structure itself is unusable (e.g. no Header)."""


def _element_to_raw_fields(elem: object) -> dict[str, str | None]:
    """Flatten one <EstablishmentDetail> element's direct children (and the
    nested Scores/Geocode groups) into a flat {tag: text} dict."""
    raw: dict[str, str | None] = {}
    for child in elem:  # type: ignore[attr-defined]
        tag = child.tag
        if tag in _NESTED_CONTAINERS:
            for grandchild in child:
                raw[grandchild.tag] = grandchild.text
        else:
            raw[tag] = child.text
    return raw


def _parse_header(elem: object) -> XmlHeader:
    extract_date_text = None
    item_count_text = None
    return_code_text = None
    for child in elem:  # type: ignore[attr-defined]
        if child.tag == "ExtractDate":
            extract_date_text = child.text
        elif child.tag == "ItemCount":
            item_count_text = child.text
        elif child.tag == "ReturnCode":
            return_code_text = child.text
    if not extract_date_text:
        raise XmlParseError("Header element is missing ExtractDate")
    extract_date_text = extract_date_text.strip()[:10]
    try:
        extract_date = date.fromisoformat(extract_date_text)
    except ValueError as exc:
        raise XmlParseError(f"Header ExtractDate {extract_date_text!r} is not a valid date") from exc
    item_count = None
    if item_count_text is not None:
        try:
            item_count = int(item_count_text.strip())
        except ValueError:
            item_count = None
    return XmlHeader(extract_date=extract_date, item_count=item_count, return_code=return_code_text)


def parse_establishment_file(source: IO[bytes]) -> Iterator[XmlHeader | EstablishmentRecord | RejectedRow]:
    """Stream-parse an FHRS/FHIS open-data XML file.

    The first item yielded is always an `XmlHeader`. Every subsequent item is
    either a validated `EstablishmentRecord` or a `RejectedRow` describing why
    one record was skipped. Raises `XmlParseError` if the file has no usable
    `Header`/`ExtractDate` (nothing else can be trusted at that point).
    """
    context = iterparse(source, events=("start", "end"))
    header: XmlHeader | None = None
    collection: object | None = None
    index = 0

    for event, elem in context:
        if event == "start":
            if elem.tag == _COLLECTION_TAG:
                collection = elem
            continue

        # event == "end"
        if elem.tag == _HEADER_TAG:
            header = _parse_header(elem)
            elem.clear()
            yield header
            continue

        if elem.tag == _DETAIL_TAG:
            if header is None:
                # Malformed/unexpected ordering: no Header seen before rows.
                raise XmlParseError("EstablishmentDetail encountered before Header/ExtractDate")
            index += 1
            raw = _element_to_raw_fields(elem)
            fhrs_id = raw.get("FHRSID")
            try:
                record = EstablishmentRecord.from_raw_fields(raw, source_extract_date=header.extract_date)
                yield record
            except (ValidationError, ValueError) as exc:
                yield RejectedRow(index=index, reason=str(exc), fhrs_id=fhrs_id)
            finally:
                elem.clear()
                if collection is not None:
                    with contextlib.suppress(ValueError):
                        collection.remove(elem)  # type: ignore[attr-defined]

    if header is None:
        raise XmlParseError("File contained no Header/ExtractDate element")
