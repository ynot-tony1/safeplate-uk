from pathlib import Path

import pytest

from ingestor.models import EstablishmentRecord
from ingestor.xml_parser import RejectedRow, XmlHeader, XmlParseError, parse_establishment_file


def _parse(path: Path) -> tuple[XmlHeader, list[EstablishmentRecord | RejectedRow]]:
    with path.open("rb") as f:
        gen = parse_establishment_file(f)
        header = next(gen)
        assert isinstance(header, XmlHeader)
        items = list(gen)
    return header, items


class TestValidFile:
    def test_header_extract_date(self, fixtures_dir: Path) -> None:
        header, _ = _parse(fixtures_dir / "valid_fhrs.xml")
        assert header.extract_date.isoformat() == "2026-04-22"
        assert header.item_count == 2
        assert header.return_code == "Success"

    def test_all_records_valid(self, fixtures_dir: Path) -> None:
        _, items = _parse(fixtures_dir / "valid_fhrs.xml")
        assert len(items) == 2
        assert all(isinstance(i, EstablishmentRecord) for i in items)

    def test_first_record_fields(self, fixtures_dir: Path) -> None:
        _, items = _parse(fixtures_dir / "valid_fhrs.xml")
        record = items[0]
        assert isinstance(record, EstablishmentRecord)
        assert record.fhrs_id == "1018650"
        assert record.business_name == "Compass Group UK & Ireland Ltd"
        assert record.normalised_name == "compass group uk ireland ltd"
        assert record.postcode == "TS6 6UD"
        assert record.postcode_prefix == "TS6"
        assert record.rating_value == "5"
        assert record.rating_key == "5"
        assert record.scheme_type == "FHRS"
        assert record.hygiene_score == 0
        assert record.structural_score == 5
        assert record.longitude == pytest.approx(-1.14209)
        assert record.latitude == pytest.approx(54.59476)
        assert record.source_extract_date.isoformat() == "2026-04-22"

    def test_record_with_missing_optional_fields(self, fixtures_dir: Path) -> None:
        _, items = _parse(fixtures_dir / "valid_fhrs.xml")
        record = items[1]
        assert isinstance(record, EstablishmentRecord)
        assert record.fhrs_id == "746361"
        assert record.postcode is None
        assert record.address_line_4 is None
        assert record.longitude is None
        assert record.latitude is None
        assert record.rating_date is None
        assert record.rating_value == "AwaitingInspection"
        assert record.rating_key == "awaiting_inspection"


class TestFhisFile:
    def test_fhis_scheme_type(self, fixtures_dir: Path) -> None:
        _, items = _parse(fixtures_dir / "valid_fhis.xml")
        assert len(items) == 2
        for item in items:
            assert isinstance(item, EstablishmentRecord)
            assert item.scheme_type == "FHIS"

    def test_fhis_rating_values(self, fixtures_dir: Path) -> None:
        _, items = _parse(fixtures_dir / "valid_fhis.xml")
        values = {i.rating_value for i in items if isinstance(i, EstablishmentRecord)}
        assert values == {"Improvement Required", "Pass and Eat Safe"}

    def test_fhis_rating_keys_normalised_not_raw_fsa_slug(self, fixtures_dir: Path) -> None:
        # Regression test: rating_key must be this app's own small taxonomy
        # ("improvement_required", "pass_and_eat_safe", ...), never FSA's raw
        # <RatingKey> XML slug (e.g. "fhis_pass_and_eat_safe_en-GB") — a
        # mismatch here silently breaks the web app's rating filter/badges
        # since they only recognise the app's own taxonomy.
        _, items = _parse(fixtures_dir / "valid_fhis.xml")
        keys = {i.rating_key for i in items if isinstance(i, EstablishmentRecord)}
        assert keys == {"improvement_required", "pass_and_eat_safe"}
        assert not any(k and k.startswith("fhis_") for k in keys)

    def test_fhis_new_rating_pending_true(self, fixtures_dir: Path) -> None:
        _, items = _parse(fixtures_dir / "valid_fhis.xml")
        second = items[1]
        assert isinstance(second, EstablishmentRecord)
        assert second.new_rating_pending is True


class TestMissingHeader:
    def test_missing_extract_date_raises(self, fixtures_dir: Path) -> None:
        with (fixtures_dir / "missing_header.xml").open("rb") as f:
            gen = parse_establishment_file(f)
            with pytest.raises(XmlParseError):
                next(gen)


class TestMalformedFile:
    def test_malformed_xml_raises(self, fixtures_dir: Path) -> None:
        with (fixtures_dir / "malformed.xml").open("rb") as f:
            gen = parse_establishment_file(f)
            with pytest.raises(Exception):  # noqa: B017 - defusedxml raises its own ParseError subclass
                header = next(gen)
                assert isinstance(header, XmlHeader)
                list(gen)


class TestMixedQuality:
    def test_counts(self, fixtures_dir: Path) -> None:
        _, items = _parse(fixtures_dir / "mixed_quality.xml")
        assert len(items) == 5
        valid = [i for i in items if isinstance(i, EstablishmentRecord)]
        rejected = [i for i in items if isinstance(i, RejectedRow)]
        assert len(valid) == 2
        assert len(rejected) == 3

    def test_rejects_missing_fhrs_id(self, fixtures_dir: Path) -> None:
        _, items = _parse(fixtures_dir / "mixed_quality.xml")
        rejected = [i for i in items if isinstance(i, RejectedRow)]
        assert any(r.fhrs_id is None for r in rejected)

    def test_rejects_invalid_scheme_type(self, fixtures_dir: Path) -> None:
        _, items = _parse(fixtures_dir / "mixed_quality.xml")
        rejected = [i for i in items if isinstance(i, RejectedRow) and i.fhrs_id == "100004"]
        assert len(rejected) == 1
        assert "SchemeType" in rejected[0].reason or "NOTASCHEME" in rejected[0].reason

    def test_defensive_row_kept_with_nulled_bad_fields(self, fixtures_dir: Path) -> None:
        _, items = _parse(fixtures_dir / "mixed_quality.xml")
        record = next(
            i for i in items if isinstance(i, EstablishmentRecord) and i.fhrs_id == "100005"
        )
        # Out-of-range/non-numeric scores are nulled, not fatal to the row.
        assert record.hygiene_score is None
        assert record.structural_score is None
        assert record.confidence_management_score is None
        # Out-of-UK-bounds coordinates are nulled.
        assert record.longitude is None
        assert record.latitude is None
        # Unparseable NewRatingPending defaults to False rather than raising.
        assert record.new_rating_pending is False
        # But the row itself is still accepted.
        assert record.rating_value == "2"

    def test_good_row_passes_through_untouched(self, fixtures_dir: Path) -> None:
        _, items = _parse(fixtures_dir / "mixed_quality.xml")
        record = next(
            i for i in items if isinstance(i, EstablishmentRecord) and i.fhrs_id == "100001"
        )
        assert record.business_name == "Good Cafe"
        assert record.postcode == "SW1A 1AA"
        assert record.hygiene_score == 5
        assert record.longitude == pytest.approx(-0.14159)
