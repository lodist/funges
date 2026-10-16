"""The learned plant season replaces a species' fixed months where its grid reaches."""
import hashlib
import io
import json

import numpy as np
import pandas as pd
import pytest

import forecast_pipeline as fp
import seasonality as sn

WEEKS = len(sn.PHENOLOGY_WEEK_DOY)


def _model(peak_week=0, lat=(45.0, 44.75), lon=(10.0, 10.25)):
    """Every cell peaks in one week (ratio 1), half that the week after, nothing otherwise."""
    ratio = np.zeros((WEEKS, len(lat), len(lon)), np.uint8)
    ratio[peak_week], ratio[(peak_week + 1) % WEEKS] = 254, 127
    return {"lat": np.array(lat), "lon": np.array(lon), "ratio": ratio}


def _rows(dates, lat=45.0, lon=10.0):
    return pd.DataFrame({"Date": pd.to_datetime(dates), "Latitude": lat, "Longitude": lon, "climate_zone": np.nan})


def test_a_place_reads_its_week_blended_with_the_next():
    first, second = sn.PHENOLOGY_WEEK_DOY[:2]
    days = pd.to_datetime("2026-01-01") + pd.to_timedelta([first - 1, (first + second) / 2 - 1, second - 1], unit="D")
    assert np.allclose(sn.phenology_ratio(_rows(days.floor("D")), _model()), [1.0, 0.75, 0.5], atol=0.08)


def test_the_learned_season_takes_over_from_the_months():
    # Elderflower in Palermo peaks in mid-April; fixed months of June and July miss it.
    params = {"season_months": [6, 7], "season_factor": 0.5}
    april = _rows(["2026-04-12"])
    week = int(np.argmin(np.abs(sn.PHENOLOGY_WEEK_DOY - 102)))   # 12 April
    months = sn.season_multiplier_for_species(april, "x", params, {}) * sn.season_gate_for_species(april, "x", params, {})
    learned = {**params, "phenology": _model(peak_week=week)}
    factor = sn.season_multiplier_for_species(april, "x", learned, {}) * sn.season_gate_for_species(april, "x", learned, {})
    assert months[0] < 0.5 and factor[0] > 0.95


def test_off_the_grid_the_months_stay():
    params = {"season_months": [5, 6], "season_factor": 0.5}
    canaries = _rows(["2026-04-22"], lat=28.3, lon=-16.5)
    learned = {**params, "phenology": _model()}
    for part in (sn.season_multiplier_for_species, sn.season_gate_for_species):
        assert np.allclose(part(canaries, "x", learned, {}), part(canaries, "x", params, {}))


def _write(tmp_path, corrupt=False):
    buffer = io.BytesIO()
    m = _model()
    np.savez_compressed(buffer, lat=m["lat"], lon=m["lon"], species=np.array(["elderflower", "blackberry"]),
                        ratio=np.stack([m["ratio"], m["ratio"]]))
    data = buffer.getvalue()
    path = tmp_path / "phenology.json"
    path.write_text(json.dumps({"continents": {"EU": {"file": "models/phenology/x/phenology_EU.npz",
                                                      "sha256": hashlib.sha256(data).hexdigest(),
                                                      "species": ["elderflower", "blackberry"]}}}))
    return path, (lambda key: data + (b"x" if corrupt else b""))


def test_attach_gives_each_shipped_species_its_season_grid(tmp_path):
    path, fetch = _write(tmp_path)
    params = {"elderflower": {}, "nettle": {}}
    fp.attach_phenology(params, "SE", path, fetch)
    assert params["elderflower"]["phenology"]["ratio"].shape == (WEEKS, 2, 2)
    assert "phenology" not in params["nettle"]


def test_a_file_that_fails_its_checksum_leaves_the_months(tmp_path, capsys):
    path, fetch = _write(tmp_path, corrupt=True)
    params = {"elderflower": {}}
    fp.attach_phenology(params, "NE", path, fetch)
    assert "phenology" not in params["elderflower"] and "months stay" in capsys.readouterr().out


def test_a_tail_below_a_tenth_of_the_peak_stays_closed():
    # Wild strawberry, North Europe: September brings 8% of June's fruit per sighting. The
    # fungi curves' gate (fully open at 10% of the peak) would keep it in season.
    tail = _model()
    tail["ratio"][2] = 20                                   # 20/254 = 8% of the peak
    september = sn.PHENOLOGY_WEEK_DOY[2]
    row = _rows(pd.to_datetime("2026-01-01") + pd.to_timedelta([september - 1], unit="D"))
    params = {"season_months": [6, 7], "phenology": tail}
    assert sn.season_gate_for_species(row, "x", params, {})[0] == 0.0
    assert sn.phenology_gate(1.0) == 1.0 and 0 < sn.phenology_gate(0.2) < 1


def test_the_season_reads_warmth_to_date_from_the_normals():
    """A place's normal warmth since 1 January (degree-days over 5 C) and its normal temperature
    that day: the learned season's clock, so a southern spring does not leak north."""
    import numpy as np
    import fit_phenology as fph
    lat = np.array([60.0, 50.0, 40.0])
    grid = {"lat": lat, "lon": np.array([0.0, 1.0]),
            "tmean": np.stack([np.full((3, 2), t) for t in (0, 0, 5, 10, 15, 20, 22, 20, 15, 10, 5, 0)], axis=0) +
                     np.array([-6.0, 0.0, 6.0])[None, :, None],
            "rain": np.ones((12, 3, 2)), "rh": np.ones((12, 3, 2))}
    rows = fph.calendar_rows(np.array([60.0, 40.0, 40.0]), np.zeros(3), np.array([105, 105, 196]), grid)
    assert rows.loc[0, "gdd_normal"] < rows.loc[1, "gdd_normal"] < rows.loc[2, "gdd_normal"]  # cold north, then later in the year
    assert rows.loc[1, "norm_tmean_day"] == pytest.approx(16.0, abs=0.6)   # mid-April between April 10 and May 15, +6


def test_a_guarded_season_stays_within_a_month_of_its_months():
    import fit_phenology as fph
    week_month = (pd.Timestamp("2026-01-01") + pd.to_timedelta(np.asarray(sn.PHENOLOGY_WEEK_DOY) - 1, unit="D")).month
    shut = fph.outside_months([3, 4, 5])
    assert set(week_month[shut]) == {1, 7, 8, 9, 10, 11, 12}
    assert not set(week_month[shut]) & {2, 3, 4, 5, 6}


def test_ripe_keeps_the_fruit_photographed_ripe_and_unbudded_leaves_drop_the_buds():
    import fit_phenology as fph
    s = pd.DataFrame({"id": [1, 2, 3, 4], "fruiting": [True, True, False, False], "flowering": [False] * 4,
                      "budding": [False, False, True, False], "no_flowers": [False, False, True, True]})
    tags = fph.stages(s, ripe=[1, 3], unripe=[2, 4])
    assert tags["ripe"].tolist() == [True, False, False, False]          # 3 is "ripe" but not fruiting
    assert tags["leaves_to_pods"].tolist() == [False, True, True, True]  # 1 ripe seeds, 2 green pods, 3-4 leaves
    assert tags["leaves"].tolist() == [False, False, True, True]
    assert tags["leaves_unbudded"].tolist() == [False, False, False, True]
    flowers = fph.stages(s.assign(flowering=[False, True, False, False]))["flowering_or_leaves"]
    assert flowers.tolist() == [False, True, True, True]                  # fruit alone is not a flower or a leaf
