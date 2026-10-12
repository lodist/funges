"""Monthly ERA5 normals: one grid read by training and by the nightly scoring alike."""
import numpy as np

import era5_normals as en


def test_humidity_from_temperature_and_dew_point():
    assert np.isclose(en.relative_humidity(np.array(15.0), np.array(15.0)), 100.0)
    assert abs(float(en.relative_humidity(np.array(20.0), np.array(10.0))) - 52.6) < 0.5


def test_a_place_reads_its_nearest_cell_for_the_month():
    lat = np.array([50.0, 49.75, 49.5], np.float32)              # descending, as ERA5 serves it
    lon = np.array([8.0, 8.25], np.float32)
    tmean = np.zeros((12, 3, 2), np.float32)
    tmean[9, 1, 1] = 11.0                                          # October at 49.75, 8.25
    tmean[0, 1, 1] = -3.0                                          # January there
    grid = {"lat": lat, "lon": lon, "tmean": tmean, "rain": tmean + 1, "rh": tmean + 2}
    out = en.lookup(grid, np.array([49.8, 49.7]), np.array([8.2, 8.3]), np.array([10, 1]))
    assert out["norm_tmean"].tolist() == [11.0, -3.0]
    assert out["norm_rain"].tolist() == [12.0, -2.0] and out["norm_rh"].tolist() == [13.0, -1.0]


def test_a_place_outside_the_grid_has_no_normals():
    grid = {"lat": np.array([50.0, 49.75], np.float32), "lon": np.array([8.0, 8.25], np.float32),
            "tmean": np.ones((12, 2, 2), np.float32), "rain": np.ones((12, 2, 2), np.float32),
            "rh": np.ones((12, 2, 2), np.float32)}
    out = en.lookup(grid, np.array([49.9, 30.0]), np.array([8.1, 8.1]), np.array([5, 5]))
    assert out["norm_tmean"][0] == 1.0 and np.isnan(out["norm_tmean"][1])
