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
