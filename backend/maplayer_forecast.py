"""Forecast-day tile scoring + two-point interpolation props for the regional MapLayer scripts.

The today tileset is unchanged (built by the existing script path). This module adds
the forward days: it reuses the same Delaunay-neighbour Gaussian combine the script
uses for today, evaluating every forecast day from ONE neighbour search per triangle,
and stores only the two endpoints (d0 today, d6 last day) so the client can interpolate.
"""
from __future__ import annotations
import numpy as np

INTERP_THRESHOLD = 4.5  # keep a triangle only if some species peaks >= this on d0 or d6


def interp_props(today_scores, d6_scores, threshold: float = INTERP_THRESHOLD) -> dict:
    """Two-point forecast props for one triangle.

    today_scores = the *production* today score per species (so day 0 of the
    forecast matches the today tile exactly); d6_scores = last forecast day. The
    client interpolates d0->d6 per slider day, so only the two endpoints are stored.

    Returns {} (drop the triangle) unless some species' max(today, d6) >= threshold
    — this is the union keep-rule, identical for the today and forecast tiles, so a
    kept polygon is present in both and never pops in/out.

    Emits `{s}_score` (d0) when non-zero, and `{s}_score_d6` only when it *differs*
    from d0. A missing _d6 therefore means "flat": the client coalesces it back to
    d0, so a polygon we can't forecast holds its value instead of fading to 0.
    """
    # Ordered union, not a set: str hashing is randomised per process, so a set would
    # shuffle the property order run to run and no two GeoJSONs would compare equal.
    species = dict.fromkeys([*today_scores, *d6_scores])
    peak = max((max(today_scores.get(s, 0.0), d6_scores.get(s, 0.0)) for s in species), default=0.0)
    if peak < threshold:
        return {}
    props: dict = {}
    for s in species:
        v0 = round(float(today_scores.get(s, 0.0)), 1)
        v6 = round(float(d6_scores.get(s, 0.0)), 1)
        if v0 != 0:
            props[f"{s}_score"] = v0
        if v6 != v0:
            props[f"{s}_score_d6"] = v6
    return props


LOW_ZOOMS = range(0, 6)  # built as cells; z6 keeps the triangles
CELL_PX = 2  # cell side on screen at its own zoom (512 px tiles)


def low_zoom_features(gdf, zoom: int, px: int = CELL_PX) -> list[dict]:
    """The pieces as squares `px` screen pixels wide at `zoom`, for that zoom's tiles.

    Left to tippecanoe, a low-zoom tile holds far more triangles than fit and most are
    dropped, so the map thins out below z6. A cell holds the area-weighted mean of the
    pieces whose centre falls in it, so every forest shows at every zoom. Props follow
    interp_props: a missing `_score` is 0, a missing `_score_d6` equals `_score`.
    """
    import pandas as pd
    if gdf.empty:
        return []
    centre = gdf.geometry.representative_point()
    lon = centre.x.to_numpy()
    lat = np.clip(centre.y.to_numpy(), -85.0511, 85.0511)
    cells = 512 * 2 ** zoom / px  # cells across the world at this zoom
    cx = np.floor((lon + 180) / 360 * cells).astype(np.int64)
    cy = np.floor((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * cells).astype(np.int64)

    keys = [c for c in gdf.columns if c.endswith('_score')]
    d0 = gdf[keys].astype(float).fillna(0.0)
    d6 = pd.DataFrame({k: gdf[f'{k}_d6'].astype(float) if f'{k}_d6' in gdf else np.nan for k in keys},
                      index=gdf.index).fillna(d0)
    w = gdf.geometry.area.to_numpy()
    frame = pd.concat([d0.mul(w, axis=0), d6.mul(w, axis=0).add_suffix('_d6')], axis=1)
    frame['_w'] = w
    frame['_cx'], frame['_cy'] = cx, cy
    sums = frame.groupby(['_cx', '_cy']).sum()
    means = sums.drop(columns='_w').div(sums['_w'].where(sums['_w'] > 0), axis=0).fillna(0.0).round(1)

    def lon_of(x):
        return x / cells * 360 - 180

    def lat_of(y):
        return np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * y / cells))))

    features = []
    for (x, y), row in zip(means.index, means.to_dict('records')):
        props = {}
        for k in keys:
            v0, v6 = row[k], row[f'{k}_d6']
            if v0 != 0:
                props[k] = v0
            if v6 != v0:
                props[f'{k}_d6'] = v6
        if not props:
            continue
        west, east, north, south = lon_of(x), lon_of(x + 1), lat_of(y), lat_of(y + 1)
        features.append({'type': 'Feature', 'properties': props, 'geometry': {
            'type': 'Polygon',
            'coordinates': [[[west, south], [east, south], [east, north], [west, north], [west, south]]]}})
    return features


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
                # Keep NaN (don't coerce to 0): the caller must tell "no forward data for
                # this day/neighbourhood" apart from a real 0 score, and hold today flat
                # instead of fading the polygon to zero (whole-region collapse otherwise).
                day_scores[species] = _combine_topk(arrays[species][idxs], neigh_w)
            per_day.append(day_scores)
        out[tri_id] = per_day
    return out
