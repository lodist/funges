"""The mushrooms' local season replaces the region and zone curves where its grid reaches."""
import hashlib
import io
import json

import numpy as np
import pandas as pd

import forecast_pipeline as fp
import seasonality as sn


def _model(peak_month=7, lat=(28.6, 28.4), lon=(-81.5, -81.3), october=127):
    """Every cell peaks in one month (ratio 1) and has October at `october` / 254."""
    ratio = np.zeros((12, len(lat), len(lon)), np.uint8)
    ratio[9] = october
    ratio[peak_month - 1] = 254
    return {"lat": np.array(lat), "lon": np.array(lon), "ratio": ratio}


def _rows(dates, lat=28.5, lon=-81.4, zone="humid_subtropical"):
    return pd.DataFrame({"Date": pd.to_datetime(dates), "Latitude": lat, "Longitude": lon, "climate_zone": zone})


def _factor(df, params, zone_curves=None):
    zone_curves = zone_curves or {}
    return (sn.season_multiplier_for_species(df, "smooth_chant", params, zone_curves)
            * sn.season_gate_for_species(df, "smooth_chant", params, zone_curves))


# The US East curve: October at 5% of July's peak, as the chanterelles' in the Appalachians.
_REGION = {m: 0.0 for m in range(1, 13)} | {6: 0.6, 7: 1.0, 8: 0.45, 9: 0.15, 10: 0.05}
_REGION_CURVE = {"multiplier": {m: 0.6 + 0.4 * v for m, v in _REGION.items()}, "ratio": _REGION}


def test_a_place_reads_its_month_blended_with_the_next():
    days = ["2026-10-15", "2026-10-30", "2026-11-14"]   # mid-October, between, mid-November
    assert np.allclose(sn.local_season_ratio(_rows(days), _model()), [0.5, 0.25, 0.0], atol=0.02)


def test_the_local_season_takes_over_from_the_region_curve():
    # Florida's smooth chanterelles: October at half the July peak, where the US East curve has 5%.
    october = _rows(["2026-10-15"])
    params = {"season_curve": _REGION_CURVE, "season_months": [6, 7, 8, 9]}
    assert _factor(october, params)[0] < 0.3
    assert _factor(october, {**params, "local_season": _model()})[0] > 0.75


def test_the_local_season_takes_over_from_a_zone_curve():
    october = _rows(["2026-10-15"])
    zones = {"humid_subtropical": {"smooth_chant": _REGION_CURVE}}
    assert _factor(october, {}, zones)[0] < 0.3
    assert _factor(october, {"local_season": _model()}, zones)[0] > 0.75


def test_off_the_grid_or_without_a_curve_today_s_curves_stay():
    params = {"season_curve": _REGION_CURVE}
    italy = _rows(["2026-10-15"], lat=43.9, lon=10.9)
    no_curve = _model()
    no_curve["ratio"][:] = 255
    for model in (_model(), no_curve):
        local = {**params, "local_season": model}
        place = italy if model is not no_curve else _rows(["2026-10-15"])
        assert np.allclose(_factor(place, local), _factor(place, params))


def _write(tmp_path, corrupt=False):
    buffer = io.BytesIO()
    m = _model()
    np.savez_compressed(buffer, lat=m["lat"], lon=m["lon"], species=np.array(["smooth_chant", "chant"]),
                        ratio=np.stack([m["ratio"], m["ratio"]]))
    data = buffer.getvalue()
    path = tmp_path / "local_season.json"
    path.write_text(json.dumps({"continents": {"US": {"file": "models/local_season/x/local_season_US.npz",
                                                      "sha256": hashlib.sha256(data).hexdigest(),
                                                      "regions": {"USE": ["smooth_chant"], "USW": ["chant"]}}}}))
    return path, (lambda key: data + (b"x" if corrupt else b""))


def test_attach_gives_the_region_s_shipped_species_their_grid(tmp_path):
    path, fetch = _write(tmp_path)
    params = {"smooth_chant": {}, "chant": {}, "morel": {}}
    fp.attach_local_season(params, "USE", path, fetch)
    assert params["smooth_chant"]["local_season"]["ratio"].shape == (12, 2, 2)
    assert "local_season" not in params["chant"] and "local_season" not in params["morel"]


def test_a_file_that_fails_its_checksum_leaves_the_region_curves(tmp_path, capsys):
    path, fetch = _write(tmp_path, corrupt=True)
    params = {"smooth_chant": {}}
    fp.attach_local_season(params, "USE", path, fetch)
    assert "local_season" not in params["smooth_chant"] and "curves stay" in capsys.readouterr().out
