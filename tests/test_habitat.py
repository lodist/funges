"""The learned habitat factor multiplies the score next to the range prior, per location."""
import hashlib
import io
import json

import numpy as np
import pandas as pd

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


def test_a_region_without_a_file_gets_nothing(tmp_path):
    path, fetch = _write(tmp_path, region="NE")
    params = {"chant": {}}
    fp.attach_habitat(params, "SE", path, fetch)
    assert "habitat" not in params["chant"]
