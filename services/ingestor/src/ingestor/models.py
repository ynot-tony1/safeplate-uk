"""Pydantic models for the FSA discovery API response and parsed XML rows."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ingestor.normalise import normalise_name, normalise_postcode
from ingestor.rating import parse_bool, parse_rating_value, parse_score, validate_uk_coordinates


def _blank_to_none(v: object) -> object:
    if isinstance(v, str) and v.strip() == "":
        return None
    return v


class DiscoveryAuthority(BaseModel):
    """One entry from `GET /authorities` — metadata about a local authority
    and the current open-data XML file it publishes."""

    model_config = ConfigDict(populate_by_name=True)

    local_authority_id: int = Field(alias="LocalAuthorityId")
    code: str = Field(alias="LocalAuthorityIdCode")
    name: str = Field(alias="Name")
    region_name: str | None = Field(default=None, alias="RegionName")
    file_name: str | None = Field(default=None, alias="FileName")
    scheme_type_raw: int = Field(alias="SchemeType")
    last_published_date: datetime | None = Field(default=None, alias="LastPublishedDate")
    establishment_count: int | None = Field(default=None, alias="EstablishmentCount")

    @field_validator("region_name", "file_name", "code", "name", mode="before")
    @classmethod
    def _empty_to_none(cls, v: object) -> object:
        return _blank_to_none(v)

    @property
    def scheme_type(self) -> str:
        """FSA's numeric SchemeType: 1 = FHRS, 2 = FHIS (confirmed against the
        live API: Scottish/NI authorities publishing FHIS report 2, England/
        Wales FHRS authorities report 1)."""
        return "FHIS" if self.scheme_type_raw == 2 else "FHRS"

    @property
    def last_published_date_only(self) -> date | None:
        if self.last_published_date is None:
            return None
        return self.last_published_date.date()


class DiscoveryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    authorities: list[DiscoveryAuthority] = Field(default_factory=list, alias="authorities")


class XmlHeader(BaseModel):
    """The `<Header>` element of an FHRS/FHIS open-data XML file."""

    extract_date: date
    item_count: int | None = None
    return_code: str | None = None


class EstablishmentRecord(BaseModel):
    """A validated `<EstablishmentDetail>` row, ready to upsert.

    Field names/types mirror the `establishments` table (see
    packages/database/prisma/schema.prisma). Construct via
    `EstablishmentRecord.from_raw_fields` rather than the constructor
    directly, so normalisation/defensive-parsing is always applied.
    """

    model_config = ConfigDict(populate_by_name=True)

    fhrs_id: str
    business_name: str
    normalised_name: str
    business_type_id: int | None = None
    business_type_name: str | None = None
    address_line_1: str | None = None
    address_line_2: str | None = None
    address_line_3: str | None = None
    address_line_4: str | None = None
    postcode: str | None = None
    postcode_prefix: str | None = None
    local_authority_code: str
    local_authority_name: str
    local_authority_web_site: str | None = None
    local_authority_email: str | None = None
    rating_value: str | None = None
    rating_key: str | None = None
    rating_date: date | None = None
    scheme_type: str
    new_rating_pending: bool = False
    hygiene_score: int | None = None
    structural_score: int | None = None
    confidence_management_score: int | None = None
    longitude: float | None = None
    latitude: float | None = None
    source_extract_date: date

    @field_validator("scheme_type")
    @classmethod
    def _scheme_type_valid(cls, v: str) -> str:
        if v not in ("FHRS", "FHIS"):
            raise ValueError(f"invalid SchemeType {v!r}, expected FHRS or FHIS")
        return v

    @field_validator("fhrs_id", "business_name", "local_authority_code", "local_authority_name")
    @classmethod
    def _required_non_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("required field is blank")
        return v.strip()

    @classmethod
    def from_raw_fields(cls, raw: dict[str, str | None], source_extract_date: date) -> EstablishmentRecord:
        """Build a validated record from the raw string fields extracted from
        one `<EstablishmentDetail>` element.

        `raw` keys are the XML element (local) names, e.g. "FHRSID",
        "BusinessName", "PostCode", "Longitude" (flattened out of
        <Geocode>), "Hygiene"/"Structural"/"ConfidenceInManagement"
        (flattened out of <Scores>). Missing keys are treated as None.
        May raise pydantic.ValidationError — callers should catch this per
        row and count it as rejected, never let it abort a whole file.
        """

        def field(name: str) -> str | None:
            v = raw.get(name)
            return _blank_to_none(v) if v is not None else None  # type: ignore[return-value]

        business_name = field("BusinessName") or ""
        postcode_raw = field("PostCode")
        normalised_postcode, postcode_prefix = normalise_postcode(postcode_raw)

        longitude = _parse_float(field("Longitude"))
        latitude = _parse_float(field("Latitude"))
        if not validate_uk_coordinates(longitude, latitude):
            longitude, latitude = None, None

        business_type_id_raw = field("BusinessTypeID")
        business_type_id = None
        if business_type_id_raw is not None:
            try:
                business_type_id = int(business_type_id_raw)
            except ValueError:
                business_type_id = None

        rating_date_raw = field("RatingDate")
        rating_date = _parse_date(rating_date_raw)

        return cls(
            fhrs_id=str(field("FHRSID") or ""),
            business_name=business_name,
            normalised_name=normalise_name(business_name) if business_name else "",
            business_type_id=business_type_id,
            business_type_name=field("BusinessType"),
            address_line_1=field("AddressLine1"),
            address_line_2=field("AddressLine2"),
            address_line_3=field("AddressLine3"),
            address_line_4=field("AddressLine4"),
            postcode=normalised_postcode or postcode_raw,
            postcode_prefix=postcode_prefix,
            local_authority_code=str(field("LocalAuthorityCode") or ""),
            local_authority_name=field("LocalAuthorityName") or "",
            local_authority_web_site=field("LocalAuthorityWebSite"),
            local_authority_email=field("LocalAuthorityEmailAddress"),
            rating_value=parse_rating_value(field("RatingValue")),
            rating_key=field("RatingKey"),
            rating_date=rating_date,
            scheme_type=field("SchemeType") or "",
            new_rating_pending=parse_bool(field("NewRatingPending"), default=False),
            hygiene_score=parse_score(field("Hygiene")),
            structural_score=parse_score(field("Structural")),
            confidence_management_score=parse_score(field("ConfidenceInManagement")),
            longitude=longitude,
            latitude=latitude,
            source_extract_date=source_extract_date,
        )


def _parse_float(raw: str | None) -> float | None:
    if raw is None:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _parse_date(raw: str | None) -> date | None:
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    # FSA dates are typically "YYYY-MM-DD", occasionally with a time component.
    candidate = text[:10]
    try:
        return date.fromisoformat(candidate)
    except ValueError:
        return None
