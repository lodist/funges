"""Species range priors: does this species grow here?

Built by tools/build_range_priors.py from GBIF observation density. Each species
has a 0.1° uint8 grid over its macro region (EU or US); 255 means core range and
0 means well-observed ground where the species is not recorded.
"""
from io import BytesIO

import numpy as np


def load_range_priors(raw):
    """npz bytes -> {species: {"lat0", "lon0", "step", "grid"}}."""
    with np.load(BytesIO(raw)) as z:
        lat0, lon0, step = float(z["lat0"]), float(z["lon0"]), float(z["step"])
        return {
            str(species): {"lat0": lat0, "lon0": lon0, "step": step, "grid": z["priors"][i]}
            for i, species in enumerate(z["species"])
        }


def range_prior_for_species(df, params):
    """Per-row prior in [0, 1]; 1.0 without a prior or outside its grid (no evidence)."""
    prior = params.get("range_prior")
    if prior is None:
        return 1.0
    grid = prior["grid"]
    i = np.floor((df["Latitude"].to_numpy(float) - prior["lat0"]) / prior["step"])
    j = np.floor((df["Longitude"].to_numpy(float) - prior["lon0"]) / prior["step"])
    inside = (i >= 0) & (i < grid.shape[0]) & (j >= 0) & (j < grid.shape[1])
    out = np.ones(len(df))
    out[inside] = grid[i[inside].astype(int), j[inside].astype(int)] / 255.0
    return out
