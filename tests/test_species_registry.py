from backend import species_registry


def test_generated_registry_supplies_land_cover_for_forecast_species():
    mapping = species_registry.get_land_cover_mapping("NE")

    assert mapping["chant"]
    assert mapping["mushroom"]


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
