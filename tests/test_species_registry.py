import pytest

from backend import species_registry


@pytest.fixture(autouse=True)
def _clear_registry_caches():
    """_known_regions is memoised, so tests that swap _registry must reset it."""
    species_registry._known_regions.cache_clear()
    yield
    species_registry._known_regions.cache_clear()


def test_generated_registry_supplies_land_cover_for_forecast_species():
    mapping = species_registry.get_land_cover_mapping("NE")

    assert mapping["chant"]
    assert mapping["mushroom"]


def test_regional_registry_excludes_unavailable_species_and_keeps_overrides():
    use = species_registry.get_species_params("USE")
    ne = species_registry.get_species_params("NE")

    for species_id in {
        "asparagus",
        "chestnut",
        "garlic",
        "masterwort",
        "parasol",
        "st_george",
        "truffle_b",
    }:
        assert species_id not in use

    assert "asparagus" not in ne
    assert "truffle_b" not in ne
    for species_id in {"artichoke", "walnut", "black_chant"}:
        assert species_id in use
        assert species_id in ne


def test_generated_scoring_is_returned_as_an_independent_copy(monkeypatch):
    monkeypatch.setattr(
        species_registry,
        "_registry",
        lambda: {
            "species": {
                "example": {
                    "regions": {
                        "NE": {
                            "landCover": [10],
                            "scoring": {"temperature": {"optimum": 18}},
                        }
                    }
                },
            }
        },
    )

    first = species_registry.get_species_params("NE")
    first["example"]["temperature"]["optimum"] = 99
    second = species_registry.get_species_params("NE")

    assert second["example"] == {"temperature": {"optimum": 18}}


def test_generated_land_cover_is_returned_as_an_independent_copy(monkeypatch):
    monkeypatch.setattr(
        species_registry,
        "_registry",
        lambda: {
            "species": {
                "example": {
                    "regions": {"NE": {"landCover": [10], "scoring": {}}}
                }
            }
        },
    )

    first = species_registry.get_land_cover_mapping("NE")
    first["example"].append(20)

    assert species_registry.get_land_cover_mapping("NE")["example"] == [10]


def test_unknown_region_is_rejected():
    for loader in (
        species_registry.get_land_cover_mapping,
        species_registry.get_species_params,
        species_registry.get_region_species,
    ):
        with pytest.raises(ValueError, match="unknown region"):
            loader("UNKNOWN")


def test_a_region_with_no_available_species_is_rejected(monkeypatch):
    monkeypatch.setattr(
        species_registry,
        "_registry",
        lambda: {
            "species": {
                "example": {
                    "regions": {"NE": {"landCover": [10], "scoring": {}}}
                }
            }
        },
    )

    assert species_registry.get_species_params("NE")
    with pytest.raises(ValueError, match="unknown region"):
        species_registry.get_species_params("USW")


# Same coordinates as the forecastRegionForCoordinate cases in
# src/test/mapStore.test.ts: both sides read the generated boundaries, and this
# pins them so a manifest change that moves one has to move both.
@pytest.mark.parametrize(
    ("longitude", "latitude", "expected"),
    [
        (-122.4, 37.8, "USW"),
        (-74, 40.7, "USE"),
        (12.5, 41.9, "SE"),
        (7.3, 47.8, "NE"),
    ],
)
def test_infer_region_follows_the_generated_boundaries(longitude, latitude, expected):
    assert species_registry.infer_region(longitude, latitude) == expected
