from datetime import date

from ingestor.import_service import is_unchanged


class TestIsUnchanged:
    def test_same_date_is_unchanged(self) -> None:
        d = date(2026, 4, 22)
        assert is_unchanged(d, d, force=False) is True

    def test_different_date_is_changed(self) -> None:
        assert is_unchanged(date(2026, 4, 22), date(2026, 5, 1), force=False) is False

    def test_no_prior_date_is_changed(self) -> None:
        assert is_unchanged(None, date(2026, 4, 22), force=False) is False

    def test_no_candidate_date_is_changed(self) -> None:
        assert is_unchanged(date(2026, 4, 22), None, force=False) is False

    def test_force_always_changed_even_if_same_date(self) -> None:
        d = date(2026, 4, 22)
        assert is_unchanged(d, d, force=True) is False

    def test_both_none_is_changed(self) -> None:
        assert is_unchanged(None, None, force=False) is False
