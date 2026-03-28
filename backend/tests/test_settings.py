"""Tests for settings validators."""
from app.settings import Settings


class TestParseOrigins:
    def test_comma_separated(self):
        result = Settings.parse_origins("https://a.com, https://b.com")
        assert result == ["https://a.com", "https://b.com"]

    def test_json_array(self):
        result = Settings.parse_origins('["https://a.com","https://b.com"]')
        assert result == ["https://a.com", "https://b.com"]

    def test_single_origin(self):
        result = Settings.parse_origins("https://a.com")
        assert result == ["https://a.com"]

    def test_list_passthrough(self):
        result = Settings.parse_origins(["https://a.com"])
        assert result == ["https://a.com"]

    def test_malformed_json_falls_back(self):
        """Malformed JSON starting with [ should raise, not silently pass."""
        import pytest
        with pytest.raises(Exception):
            Settings.parse_origins("[invalid json")
