"""The learned habitat factor multiplies the score next to the range prior, per location."""
import hashlib
import io
import json

import numpy as np
import pandas as pd
import pytest

import forecast_pipeline as fp
from range_prior import habitat_values, range_prior_for_species


def _params(ids=("A", "B"), values=(0.5, 1.0)):
    return {"habitat": {"index": pd.Index(ids), "factor": np.array(values)}}


def test_a_location_reads_its_factor_and_an_unlisted_one_reads_one():
    df = pd.DataFrame({"Location_Id": ["A", "B", "Z"], "Latitude": 0.0, "Longitude": 0.0})
    assert habitat_values(df, _params()).tolist() == [0.5, 1.0, 1.0]
    assert habitat_values(df, {}) == 1.0


def test_the_range_prior_carries_the_habitat_factor():
    df = pd.DataFrame({"Location_Id": ["A", "B"], "Latitude": 0.0, "Longitude": 0.0})
    assert np.allclose(range_prior_for_species(df, _params()), [0.5, 1.0])


def _write(tmp_path, region="SE", corrupt=False):
    buffer = io.BytesIO()
    np.savez_compressed(buffer, ids=np.array(["A", "B"]), species=np.array(["chant", "parasol"]),
                        factor=np.array([[128, 255], [255, 64]], np.uint8))
    data = buffer.getvalue()
    path = tmp_path / "habitat_factor.json"
    path.write_text(json.dumps({"regions": {region: {"file": "models/habitat/x/habitat_SE.npz",
                                                     "sha256": hashlib.sha256(data).hexdigest(),
                                                     "species": ["chant", "parasol"]}}}))
    return path, (lambda key: data + (b"x" if corrupt else b""))


def test_attach_gives_each_shipped_species_its_column(tmp_path):
    path, fetch = _write(tmp_path)
    params = {"chant": {}, "parasol": {}, "mushroom": {}}
    fp.attach_habitat(params, "SE", path, fetch)
    df = pd.DataFrame({"Location_Id": ["A", "B"]})
    assert np.allclose(habitat_values(df, params["chant"]), [128 / 255, 1.0])
    assert np.allclose(habitat_values(df, params["parasol"]), [1.0, 64 / 255])
    assert "habitat" not in params["mushroom"]


def test_a_file_that_fails_its_checksum_leaves_scores_without_it(tmp_path, capsys):
    path, fetch = _write(tmp_path, corrupt=True)
    params = {"chant": {}}
    fp.attach_habitat(params, "SE", path, fetch)
    assert "habitat" not in params["chant"] and "without it" in capsys.readouterr().out


def test_an_added_species_joins_the_shipped_file_and_no_other_factor_moves(tmp_path, monkeypatch):
    import fit_habitat as fh
    uploaded = {}

    class R2:
        get_required_env = staticmethod(lambda name: "bucket")

        @staticmethod
        def _r2_client():
            class Client:
                def put_object(self, Bucket, Key, Body, ContentType):
                    uploaded[Key] = Body
            return Client()

    def add(ids):
        path, R2.r2_fetch = _write(tmp_path)
        monkeypatch.setattr(fh, "SHIPPED", path)
        monkeypatch.setattr(fh, "r2_folder", lambda: (R2, "models/habitat/new"))
        fh.add_to_shipped("bay_bolete", {("bay_bolete", "SE"): np.array([0.5, 1.0])}, {"SE": np.array(ids)})
        return json.loads(path.read_text())["regions"]["SE"]

    entry = add(["A", "B"])
    with np.load(io.BytesIO(uploaded[entry["file"]])) as z:
        columns = {str(s): z["factor"][:, k].tolist() for k, s in enumerate(z["species"])}
    assert entry["species"] == ["bay_bolete", "chant", "parasol"]
    assert entry["sha256"] == hashlib.sha256(uploaded[entry["file"]]).hexdigest()
    assert columns == {"bay_bolete": [128, 255], "chant": [128, 255], "parasol": [255, 64]}
    with pytest.raises(AssertionError, match="places changed"):
        add(["A", "C"])


def test_the_cap_thins_only_crowded_blocks_and_picks_the_same_finds_every_time():
    from fit_habitat import capped
    features = pd.DataFrame({"Location_Id": ["NL", "UK", "DK"], "Latitude": [52.1, 51.0, 52.5],
                             "Longitude": [5.1, -1.0, 5.9]})          # NL and DK share the 52N 4E block
    days = pd.date_range("2020-09-01", periods=10)
    finds = pd.concat([pd.DataFrame({"species": "bay", "Location_Id": place, "Date": days[:n]})
                       for place, n in (("NL", 10), ("UK", 3), ("DK", 4))]
                      + [pd.DataFrame({"species": "other", "Location_Id": "NL", "Date": days})], ignore_index=True)
    kept = capped(finds, "bay", features, 5)
    bay = kept[kept["species"] == "bay"]
    assert len(bay[bay["Location_Id"].isin(["NL", "DK"])]) == 5 and (bay["Location_Id"] == "UK").sum() == 3
    assert (kept["species"] == "other").sum() == 10
    assert kept.equals(capped(finds.sample(frac=1, random_state=1), "bay", features, 5).sort_index())
    assert capped(finds, "bay", features, None) is finds


def test_a_region_without_a_file_gets_nothing(tmp_path):
    path, fetch = _write(tmp_path, region="NE")
    params = {"chant": {}}
    fp.attach_habitat(params, "SE", path, fetch)
    assert "habitat" not in params["chant"]


def _upland(years=6, per_year=120, seed=4):
    """A species found only above 1,000 m and bracket finds (where people walked) at any
    altitude on the same days; a flat score, so only a habitat factor can tell the places apart."""
    rng = np.random.default_rng(seed)
    altitude = rng.uniform(0, 2000, 400)
    features = pd.DataFrame({"Location_Id": [f"L{i}" for i in range(400)], "altitude": altitude, "tree_map": True})
    high = np.flatnonzero(altitude > 1000)
    rows = []
    for year in range(2016, 2016 + years):
        for day in range(per_year):
            date = pd.Timestamp(year, 8, 1) + pd.Timedelta(days=day % 60)
            rows.append(("upland", f"L{rng.choice(high)}", date))
            rows.extend(("placebo", f"L{p}", date) for p in rng.choice(400, 4, replace=False))
    finds = pd.DataFrame(rows, columns=["species", "Location_Id", "Date"])
    found = finds["Date"]
    return finds, features, dict(
        years=found.dt.year.to_numpy(), weeks=(found.dt.year * 100 + found.dt.isocalendar().week).to_numpy(int),
        dates=found.to_numpy().astype("datetime64[D]").astype(np.int64), sites=finds["Location_Id"].to_numpy())


def test_held_out_years_find_the_upland_species_habitat():
    from fit_fruiting_parts import control_sets
    from fit_habitat import held_out_years
    finds, features, d = _upland()
    mine, plac = (finds["species"] == "upland").to_numpy(), (finds["species"] == "placebo").to_numpy()
    at = control_sets(mine, plac, d["dates"], d["sites"])
    fit = held_out_years("upland", np.ones(len(finds)), at, d["years"], d["weeks"], d["sites"], finds, features,
                         place_score=lambda sites, dates: np.ones(len(sites)))
    assert fit["years_bracket_finds"] == len(at) and fit["years_bracket_score"] == 0.5
    assert fit["years_bracket_gain"] > 0.15 and fit["years_bracket_ci_low"] > 0
    assert fit["years_all_score"] == 0.5 and fit["years_all_gain"] > 0.15 and fit["years_all_ci_low"] > 0


def test_the_held_out_years_decide_unless_2026_says_worse():
    from fit_habitat import ships
    nan = np.nan
    table = pd.DataFrame({
        "species": list("abcdefg"),
        "all_finds": [200, 200, nan, nan, 37, nan, nan], "all_score": [0.6, 0.6, nan, nan, 0.838, nan, nan],
        "all_with_factor": [0.7, 0.5, nan, nan, 0.873, nan, nan],
        "bracket_score": [0.6, 0.6, nan, nan, 0.812, nan, nan],
        "bracket_with_factor": [0.6, 0.7, nan, nan, 0.788, nan, nan],
        "years_bracket_ci_low": [nan, 0.02, 0.01, -0.01, 0.05, 0.03, -0.01],
        "years_bracket_ci_high": [nan, 0.05, 0.04, 0.02, 0.07, 0.06, 0.01],
        "years_all_ci_low": [nan, 0.01, -0.01, -0.02, 0.01, -0.04, 0.02],
        "years_all_ci_high": [nan, 0.04, 0.03, 0.01, 0.03, -0.01, 0.05]})
    # a: 2026 alone; b: 2026's finds rank worse; c: better against brackets, not worse against all
    # fungi; d: neither; e: 37 finds' bracket dip against 2,854 held out; f: better against brackets
    # but worse against all fungi (hen of the woods in US East, 2026); g: better against all fungi
    assert ships(table).tolist() == [True, False, True, False, True, False, True]
