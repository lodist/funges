"""Where a species can grow at all: its observed range and, for mycorrhizal fungi, host trees.

Range priors are built by tools/build_range_priors.py from GBIF observation density:
each species has a 0.1° uint8 grid over its macro region (EU or US); 255 means it
can grow there and 0 means well-observed ground where it is not recorded.

Host cover is built by tools/build_host_cover.py: per host class, the share of the
ground around each 0.05° cell. A species' `hosts` (from its manifest) turn it into
the same kind of 0-1 grid.
"""
from io import BytesIO

import numpy as np

# Host share of the ground around a point that already gives the full score: about
# half a km² of host stands within ~5 km. The maps record the dominant type per
# stand, so a host that is common but rarely dominant (birch under maple/beech)
# shows up as a small share. Against 2026 US sightings, 2% hid 3.2% of B. edulis
# (10%: 4.8%) and still zeroed it in Missouri, Kansas and Georgia.
HOST_FULL_COVER = 0.02
# Cover is stored as uint16: at uint8 a step (0.4%) is a fifth of HOST_FULL_COVER.
COVER_SCALE = 65535


def load_range_priors(raw):
    """npz bytes -> {species: {"lat0", "lon0", "step", "grid"}}."""
    with np.load(BytesIO(raw)) as z:
        lat0, lon0, step = float(z["lat0"]), float(z["lon0"]), float(z["step"])
        return {
            str(species): {"lat0": lat0, "lon0": lon0, "step": step, "grid": z["priors"][i]}
            for i, species in enumerate(z["species"])
        }


def load_host_cover(raw):
    """npz bytes -> {"lat0", "lon0", "step", "mapped", "classes": {host class: uint16 cover grid}}."""
    with np.load(BytesIO(raw)) as z:
        return {
            "lat0": float(z["lat0"]), "lon0": float(z["lon0"]), "step": float(z["step"]), "mapped": z["mapped"],
            "classes": {str(name): z["cover"][i] for i, name in enumerate(z["classes"])},
        }


def host_prior(cover, hosts):
    """Grid for one species: 0 with none of its hosts around, 1 from HOST_FULL_COVER up.

    Ground the source map does not reach stays 1: no evidence either way.
    """
    share = sum(cover["classes"][h].astype(float) for h in hosts) / COVER_SCALE
    factor = np.where(cover["mapped"], np.clip(share / HOST_FULL_COVER, 0, 1), 1.0)
    grid = np.rint(factor * 255).astype(np.uint8)
    return {"lat0": cover["lat0"], "lon0": cover["lon0"], "step": cover["step"], "grid": grid}


def grid_values(df, prior):
    """Per-row value in [0, 1]; 1.0 without a grid or outside it (no evidence)."""
    if prior is None:
        return 1.0
    grid = prior["grid"]
    i = np.floor((df["Latitude"].to_numpy(float) - prior["lat0"]) / prior["step"])
    j = np.floor((df["Longitude"].to_numpy(float) - prior["lon0"]) / prior["step"])
    inside = (i >= 0) & (i < grid.shape[0]) & (j >= 0) & (j < grid.shape[1])
    out = np.ones(len(df))
    out[inside] = grid[i[inside].astype(int), j[inside].astype(int)] / 255.0
    return out


def range_prior_for_species(df, params):
    """Range prior times host prior, per row."""
    return grid_values(df, params.get("range_prior")) * grid_values(df, params.get("host_prior"))
