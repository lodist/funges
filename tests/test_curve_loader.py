"""The real curve loader, on both schemas.

This path had no coverage: the phase-2 fixture injects `season_curve` directly, so
`_load_species_and_curves` was never exercised. That is how a loader that raised on the
two-part schema got written -- and because the loader catches Exception and only warns, the
symptom would have been production silently dropping every empirical curve and running on
`season_months` alone. A test that just checks "no traceback" would have passed.
"""
import json

import pytest

import forecast_pipeline as fp
import seasonality as sn

SPECIES_PARAMS = {
    "chant": {"season_months": [7, 8]},
    "morel": {"season_months": [3, 4, 5]},
}
FLAT = {m: round(0.6 + 0.4 * v, 3) for m, v in
        {1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.05, 6: 0.4,
         7: 1.0, 8: 0.8, 9: 0.45, 10: 0.2, 11: 0.15, 12: 0.05}.items()}
TWO_PART = {
    "multiplier": FLAT,
    "ratio": {m: round((v - 0.6) / 0.4, 4) for m, v in FLAT.items()},
}


class _Config:
    region = "NE"
    season_curves_env = "TEST_SEASON_CURVES"
    zone_curves_env = "TEST_ZONE_CURVES"


def _load(tmp_path, monkeypatch, region_curves, zone_curves, capsys):
    region_path = tmp_path / "region.json"
    region_path.write_text(json.dumps({"chant": region_curves}), encoding="utf-8")
    zone_path = tmp_path / "zone.json"
    zone_path.write_text(json.dumps({"temperate": {"chant": zone_curves}}), encoding="utf-8")
    monkeypatch.setenv("TEST_SEASON_CURVES", str(region_path))
    monkeypatch.setenv("TEST_ZONE_CURVES", str(zone_path))
    monkeypatch.setattr(
        fp,
        "get_species_params",
        lambda region: {
            species: dict(config) for species, config in SPECIES_PARAMS.items()
        },
    )
    params, zones = fp._load_species_and_curves(_Config())
    # A silent fallback is the failure mode this file exists to catch.
    assert "[warn]" not in capsys.readouterr().out
    return params, zones


@pytest.mark.parametrize("schema,expect_ratio", [("flat", False), ("two_part", True)])
def test_loader_accepts_both_curve_schemas(tmp_path, monkeypatch, capsys, schema, expect_ratio):
    curve = FLAT if schema == "flat" else TWO_PART
    params, zones = _load(tmp_path, monkeypatch, curve, curve, capsys)

    multiplier, ratio = sn.split_curve(params["chant"]["season_curve"])
    assert multiplier[7] == pytest.approx(1.0)
    assert multiplier[1] == pytest.approx(0.6)
    assert (ratio is not None) is expect_ratio

    zone_multiplier, zone_ratio = sn.split_curve(zones["temperate"]["chant"])
    assert zone_multiplier[7] == pytest.approx(1.0)
    assert (zone_ratio is not None) is expect_ratio


def test_loader_produces_int_month_keys(tmp_path, monkeypatch, capsys):
    """JSON keys arrive as strings; the interpolator indexes by int."""
    params, zones = _load(tmp_path, monkeypatch, TWO_PART, TWO_PART, capsys)
    multiplier, ratio = sn.split_curve(params["chant"]["season_curve"])
    assert all(isinstance(k, int) for k in multiplier)
    assert all(isinstance(k, int) for k in ratio)


def test_species_without_a_curve_keeps_season_months(tmp_path, monkeypatch, capsys):
    params, _zones = _load(tmp_path, monkeypatch, TWO_PART, TWO_PART, capsys)
    assert "season_curve" not in params["morel"]
    assert params["morel"]["season_months"] == [3, 4, 5]


def test_a_ratio_curve_gates_harder_than_season_months(tmp_path, monkeypatch, capsys):
    """The two schemas must both suppress a dead month; the ratio one may reach zero."""
    import pandas as pd
    frame = pd.DataFrame({"Date": pd.to_datetime(["2026-01-15"]), "climate_zone": ["temperate"]})

    flat_params, flat_zones = _load(tmp_path, monkeypatch, FLAT, FLAT, capsys)
    ratio_params, ratio_zones = _load(tmp_path, monkeypatch, TWO_PART, TWO_PART, capsys)

    flat_gate = sn.season_gate_for_species(frame, "chant", flat_params["chant"], flat_zones)
    ratio_gate = sn.season_gate_for_species(frame, "chant", ratio_params["chant"], ratio_zones)

    assert flat_gate[0] == pytest.approx(sn.SEASON_MONTHS_GATE_FLOOR)
    assert ratio_gate[0] == pytest.approx(0.0)
    assert ratio_gate[0] < flat_gate[0]
