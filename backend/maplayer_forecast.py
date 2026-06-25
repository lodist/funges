"""Forecast-day tile scoring + sparse delta props for the regional MapLayer scripts.

The today tileset is unchanged (built by the existing script path). This module adds
the forward days (d1..d6): it reuses the same Delaunay-neighbour Gaussian combine the
script uses for today, evaluating every forecast day from ONE neighbour search per
triangle, and emits only the cells that visibly differ from today (sparse delta).
"""
from __future__ import annotations
import numpy as np

FORECAST_THRESHOLD = 0.5  # emit a forecast cell only if it moves >= this vs today (one ramp step)


def forecast_props(per_day, threshold: float = FORECAST_THRESHOLD) -> dict:
    """Sparse forecast delta props for one triangle.

    per_day[0] == today (d0); per_day[n>=1] are forecast days. Emit
    ``<species>_score_d{n}`` (n>=1) only when it visibly differs from today:
    ``abs(round(dn,1) - round(d0,1)) >= threshold``. Returns {} when nothing
    changes (caller drops the triangle from the forecast tileset).
    """
    today = per_day[0]
    props: dict = {}
    for n in range(1, len(per_day)):
        for species, value in per_day[n].items():
            d0 = round(float(today.get(species, 0.0)), 1)
            dn = round(float(value), 1)
            if abs(dn - d0) >= threshold:
                props[f"{species}_score_d{n}"] = dn
    return props


def _combine_topk(values: np.ndarray, weights: np.ndarray) -> float:
    """Gaussian top-30%-median combine — same rule as the today loop in *_MapLayer.py."""
    m = np.isfinite(values)
    if not np.any(m):
        return np.nan
    v, w = values[m], weights[m]
    if v.size >= 20:
        k = max(5, int(0.3 * w.size))
        top = np.argpartition(-w, k - 1)[:k]
        return float(np.median(v[top]))
    s = w.sum()
    return float(np.dot(v, w) / s) if s > 0 else np.nan


def score_days(tree, xy_m, tri_centroids_m, valid_tris, tri_id_to_raster,
               species_validsets, species_arrays_by_day, *,
               base_radius_km: float = 4, max_radius_km: float = 30,
               min_neighbors: int = 2, sigma_m: float = 10000.0):
    """Per-triangle scores for every day in ``species_arrays_by_day``.

    species_arrays_by_day: list (len = n_days) of {species: np.ndarray aligned to xy_m}.
    Returns {tri_id: [ {species: score} per day ]}; index 0 == today (d0). One
    neighbour search per triangle is reused across all days.
    """
    n_days = len(species_arrays_by_day)
    out: dict = {}
    for tri_id, centroid_m in tri_centroids_m.items():
        if tri_id not in valid_tris:
            continue
        r_m, r_max = base_radius_km * 1000.0, max_radius_km * 1000.0
        idxs = tree.query_ball_point(centroid_m, r_m)
        while len(idxs) < min_neighbors and r_m < r_max:
            r_m *= 1.6
            idxs = tree.query_ball_point(centroid_m, r_m)
        if not idxs:
            continue
        idxs = np.asarray(idxs, dtype=int)
        dists_m = np.linalg.norm(xy_m[idxs] - centroid_m, axis=1)
        neigh_w = np.exp(-(dists_m ** 2) / (2.0 * sigma_m ** 2))
        tri_rv = tri_id_to_raster.get(tri_id)
        if tri_rv is None:
            continue
        per_day = []
        for di in range(n_days):
            arrays = species_arrays_by_day[di]
            day_scores = {}
            for species, vset in species_validsets.items():
                if tri_rv not in vset:
                    continue
                v = _combine_topk(arrays[species][idxs], neigh_w)
                day_scores[species] = 0.0 if not np.isfinite(v) else v
            per_day.append(day_scores)
        out[tri_id] = per_day
    return out
