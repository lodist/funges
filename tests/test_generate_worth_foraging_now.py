from scripts import generate_worth_foraging_now


def test_species_columns_are_discovered_from_generated_registry(monkeypatch):
    monkeypatch.setattr(
        generate_worth_foraging_now,
        "get_species_metadata",
        lambda: {
            "new-species": {
                "dataColumns": ["new-species_score", "Display name"]
            },
            "legacy": {"dataColumns": ["legacy_score", "Legacy Name"]},
        },
    )
    monkeypatch.setattr(
        generate_worth_foraging_now,
        "get_region_species",
        lambda region: {
            "NE": {"new-species"},
            "SE": {"new-species"},
            "USE": {"legacy"},
            "USW": {"legacy"},
        }[region],
    )

    columns = generate_worth_foraging_now.resolve_species_columns(
        {"new-species_score", "Legacy Name"}
    )

    assert columns == {
        "new-species": "new-species_score",
        "legacy": "Legacy Name",
    }
    assert generate_worth_foraging_now.resolve_region_species() == {
        "NE": {"new-species"},
        "SE": {"new-species"},
        "USE": {"legacy"},
        "USW": {"legacy"},
    }
