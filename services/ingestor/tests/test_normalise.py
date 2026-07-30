from ingestor.normalise import normalise_name, normalise_postcode


class TestNormaliseName:
    def test_lowercases_and_strips_punctuation(self) -> None:
        assert normalise_name("Compass Group UK & Ireland Ltd.") == "compass group uk ireland ltd"

    def test_collapses_whitespace(self) -> None:
        assert normalise_name("  The   Big   Cafe  ") == "the big cafe"

    def test_handles_apostrophes_and_hyphens(self) -> None:
        assert normalise_name("McDonald's - Drive Thru") == "mcdonald s drive thru"

    def test_empty_string(self) -> None:
        assert normalise_name("") == ""


class TestNormalisePostcode:
    def test_normalises_lowercase_no_space(self) -> None:
        assert normalise_postcode("sw1a1aa") == ("SW1A 1AA", "SW1A")

    def test_normalises_already_spaced(self) -> None:
        assert normalise_postcode("TR24 0QQ") == ("TR24 0QQ", "TR24")

    def test_normalises_extra_whitespace(self) -> None:
        assert normalise_postcode("  ze1   0ex ") == ("ZE1 0EX", "ZE1")

    def test_none_input(self) -> None:
        assert normalise_postcode(None) == (None, None)

    def test_blank_input(self) -> None:
        assert normalise_postcode("   ") == (None, None)

    def test_garbage_input_returns_none(self) -> None:
        assert normalise_postcode("not a postcode") == (None, None)

    def test_too_short_returns_none(self) -> None:
        assert normalise_postcode("SW1") == (None, None)
