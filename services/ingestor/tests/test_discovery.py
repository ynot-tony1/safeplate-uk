from ingestor.discovery import find_authority
from ingestor.models import DiscoveryAuthority, DiscoveryResponse

SAMPLE_PAYLOAD = {
    "authorities": [
        {
            "LocalAuthorityId": 197,
            "LocalAuthorityIdCode": "760",
            "Name": "Aberdeen City",
            "FriendlyName": "aberdeen-city",
            "Url": "http://www.aberdeencity.gov.uk",
            "SchemeUrl": "",
            "Email": "commercial@aberdeencity.gov.uk",
            "RegionName": "Scotland",
            "FileName": "https://ratings.food.gov.uk/OpenDataFiles/FHRS760en-GB.xml",
            "FileNameWelsh": None,
            "EstablishmentCount": 2205,
            "CreationDate": "2010-08-17T15:30:24.87",
            "LastPublishedDate": "2026-07-29T00:40:41.353",
            "SchemeType": 2,
            "links": [{"rel": "self", "href": "https://api.ratings.food.gov.uk/authorities/197"}],
        },
        {
            "LocalAuthorityId": 277,
            "LocalAuthorityIdCode": "323",
            "Name": "Adur",
            "FriendlyName": "adur",
            "Url": "http://www.adur-worthing.gov.uk",
            "SchemeUrl": "",
            "Email": "environmental.health@adur-worthing.gov.uk",
            "RegionName": "South East",
            "FileName": "https://ratings.food.gov.uk/OpenDataFiles/FHRS323en-GB.xml",
            "FileNameWelsh": None,
            "EstablishmentCount": 469,
            "CreationDate": "2010-08-17T15:30:24.87",
            "LastPublishedDate": "2026-07-30T00:40:44.413",
            "SchemeType": 1,
            "links": [{"rel": "self", "href": "https://api.ratings.food.gov.uk/authorities/277"}],
        },
    ]
}


class TestDiscoveryResponseParsing:
    def test_parses_both_authorities(self) -> None:
        response = DiscoveryResponse.model_validate(SAMPLE_PAYLOAD)
        assert len(response.authorities) == 2

    def test_scheme_type_mapping(self) -> None:
        response = DiscoveryResponse.model_validate(SAMPLE_PAYLOAD)
        by_code = {a.code: a for a in response.authorities}
        # Confirmed against the live API: Scottish authority (SchemeType 2) -> FHIS.
        assert by_code["760"].scheme_type == "FHIS"
        # England/Wales authority (SchemeType 1) -> FHRS.
        assert by_code["323"].scheme_type == "FHRS"

    def test_empty_scheme_url_becomes_none(self) -> None:
        authority = DiscoveryAuthority.model_validate(SAMPLE_PAYLOAD["authorities"][0])
        assert authority.region_name == "Scotland"

    def test_last_published_date_only(self) -> None:
        authority = DiscoveryAuthority.model_validate(SAMPLE_PAYLOAD["authorities"][1])
        assert authority.last_published_date_only.isoformat() == "2026-07-30"

    def test_missing_file_name_becomes_none(self) -> None:
        payload = dict(SAMPLE_PAYLOAD["authorities"][0])
        payload["FileName"] = ""
        authority = DiscoveryAuthority.model_validate(payload)
        assert authority.file_name is None


class TestFindAuthority:
    def test_finds_by_code(self) -> None:
        response = DiscoveryResponse.model_validate(SAMPLE_PAYLOAD)
        found = find_authority(response.authorities, "323")
        assert found is not None
        assert found.name == "Adur"

    def test_returns_none_for_unknown_code(self) -> None:
        response = DiscoveryResponse.model_validate(SAMPLE_PAYLOAD)
        assert find_authority(response.authorities, "999999") is None
