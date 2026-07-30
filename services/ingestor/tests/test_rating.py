from ingestor.rating import (
    is_known_rating_value,
    parse_bool,
    parse_rating_value,
    parse_score,
    validate_uk_coordinates,
)


class TestParseRatingValue:
    def test_numeric_fhrs(self) -> None:
        assert parse_rating_value("5") == "5"
        assert parse_rating_value("0") == "0"

    def test_fhis_text_values(self) -> None:
        assert parse_rating_value("Pass and Eat Safe") == "Pass and Eat Safe"
        assert parse_rating_value("Improvement Required") == "Improvement Required"

    def test_fhrs_awaiting_no_space(self) -> None:
        assert parse_rating_value("AwaitingInspection") == "AwaitingInspection"

    def test_collapses_whitespace(self) -> None:
        assert parse_rating_value("  Exempt  ") == "Exempt"

    def test_none_returns_none(self) -> None:
        assert parse_rating_value(None) is None

    def test_blank_returns_none(self) -> None:
        assert parse_rating_value("   ") is None


class TestIsKnownRatingValue:
    def test_numeric_values_known(self) -> None:
        for v in ["0", "1", "2", "3", "4", "5"]:
            assert is_known_rating_value(v)

    def test_fhis_values_known(self) -> None:
        for v in ["Pass", "Pass and Eat Safe", "Improvement Required", "Exempt"]:
            assert is_known_rating_value(v)

    def test_awaiting_variants_known(self) -> None:
        assert is_known_rating_value("AwaitingInspection")
        assert is_known_rating_value("Awaiting Inspection")
        assert is_known_rating_value("AwaitingPublication")

    def test_unknown_value(self) -> None:
        assert not is_known_rating_value("SomeFutureRatingFSAHaventInventedYet")


class TestParseScore:
    def test_valid_score(self) -> None:
        assert parse_score("5") == 5
        assert parse_score("0") == 0

    def test_none_returns_none(self) -> None:
        assert parse_score(None) is None

    def test_blank_returns_none(self) -> None:
        assert parse_score("") is None

    def test_non_numeric_returns_none(self) -> None:
        assert parse_score("not-a-number") is None

    def test_negative_out_of_range_returns_none(self) -> None:
        assert parse_score("-5") is None

    def test_too_large_out_of_range_returns_none(self) -> None:
        assert parse_score("999") is None

    def test_boundary_values(self) -> None:
        assert parse_score("0") == 0
        assert parse_score("100") == 100
        assert parse_score("101") is None


class TestParseBool:
    def test_true_variants(self) -> None:
        assert parse_bool("True") is True
        assert parse_bool("true") is True
        assert parse_bool("  TRUE ") is True

    def test_false_variants(self) -> None:
        assert parse_bool("False") is False
        assert parse_bool("false") is False

    def test_missing_uses_default(self) -> None:
        assert parse_bool(None, default=False) is False
        assert parse_bool(None, default=True) is True

    def test_garbage_uses_default(self) -> None:
        assert parse_bool("Maybe", default=False) is False
        assert parse_bool("Maybe", default=True) is True


class TestValidateUkCoordinates:
    def test_valid_london(self) -> None:
        assert validate_uk_coordinates(-0.1276, 51.5074) is True

    def test_valid_shetland(self) -> None:
        assert validate_uk_coordinates(-1.1449, 60.1519) is True

    def test_out_of_bounds_sydney(self) -> None:
        assert validate_uk_coordinates(151.2093, -33.8688) is False

    def test_missing_longitude(self) -> None:
        assert validate_uk_coordinates(None, 51.5) is False

    def test_missing_latitude(self) -> None:
        assert validate_uk_coordinates(-0.1, None) is False

    def test_both_missing(self) -> None:
        assert validate_uk_coordinates(None, None) is False
