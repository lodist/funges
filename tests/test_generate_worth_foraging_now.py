import json

from scripts import generate_worth_foraging_now


def test_species_columns_are_discovered_from_generated_registry(tmp_path, monkeypatch):
    registry = tmp_path / "species_registry.json"
    registry.write_text(
        json.dumps(
            {
                "species": {
                    "new-species": {
                        "dataColumns": ["new-species_score", "Display name"],
                        "regions": {"NE": {}, "SE": {}},
                    },
                    "legacy": {
                        "dataColumns": ["legacy_score", "Legacy Name"],
                        "regions": {"USE": {}, "USW": {}},
                    },
                }
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        generate_worth_foraging_now, "SPECIES_REGISTRY_PATH", registry
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
