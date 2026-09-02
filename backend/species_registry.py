"""Read the generated forecast registry derived from species manifests."""

import copy
import json
from functools import lru_cache
from pathlib import Path

_REGISTRY_PATH = Path(__file__).resolve().parent / "generated" / "species_registry.json"


@lru_cache(maxsize=1)
def _registry():
    return json.loads(_REGISTRY_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _known_regions():
    """Regions that carry at least one available species."""
    return frozenset(
        region
        for config in _registry()["species"].values()
        for region in config["regions"]
    )


def _require_region(region):
    known = _known_regions()
    if region not in known:
        raise ValueError(
            f"unknown region {region!r}; expected one of {', '.join(sorted(known))}"
        )


def infer_region(longitude, latitude):
    """Return the forecast region a coordinate belongs to.

    The boundaries are generated from the species manifests, the same numbers the
    map store reads from src/generated/species-catalog.ts, so the scored regions and
    the region the frontend offers species for cannot drift apart.
    """
    boundaries = _registry()["regionBoundaries"]
    if longitude < boundaries["uswMaxLongitude"]:
        return "USW"
    if longitude < boundaries["usMaxLongitude"]:
        return "USE"
    return "SE" if latitude < boundaries["seMaxLatitude"] else "NE"


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
