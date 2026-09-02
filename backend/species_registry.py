"""Read the generated forecast registry derived from species manifests."""

import copy
import json
from functools import lru_cache
from pathlib import Path

_REGISTRY_PATH = Path(__file__).resolve().parent / "generated" / "species_registry.json"


@lru_cache(maxsize=1)
def _registry():
    return json.loads(_REGISTRY_PATH.read_text(encoding="utf-8"))


def _known_regions():
    """Regions that carry at least one available species."""
    return frozenset(
        region
        for config in _registry()["species"].values()
        for region in config["regions"]
    )


def _require_region(region):
    if region not in _known_regions():
        raise ValueError(
            f"unknown region {region!r}; expected one of {', '.join(sorted(_known_regions()))}"
        )


def get_land_cover_mapping(region):
    """Return the canonical species -> land-cover mapping for one region."""
    _require_region(region)
    return {
        species_id: copy.deepcopy(config["regions"][region]["landCover"])
        for species_id, config in _registry()["species"].items()
        if region in config["regions"]
    }


def get_species_params(region):
    """Return a mutable copy of the canonical scoring parameters for one region."""
    _require_region(region)
    return {
        species_id: copy.deepcopy(config["regions"][region]["scoring"])
        for species_id, config in _registry()["species"].items()
        if region in config["regions"]
    }


def get_region_species(region):
    """Return the forecast species available in one region."""
    _require_region(region)
    return {
        species_id
        for species_id, config in _registry()["species"].items()
        if region in config["regions"]
    }


def get_empirical_taxon_map():
    """Return species with GBIF taxa used to build empirical season curves."""
    return {
        species_id: copy.deepcopy(config["empiricalTaxonKeys"])
        for species_id, config in _registry()["species"].items()
        if config["empiricalTaxonKeys"]
    }


def get_species_metadata():
    """Return a mutable copy of forecast-species names and data-column aliases."""
    return {
        species_id: {
            "name": config["name"],
            "scientificName": config["scientificName"],
            "identificationRank": config["identificationRank"],
            "dataColumns": copy.deepcopy(config["dataColumns"]),
        }
        for species_id, config in _registry()["species"].items()
    }
