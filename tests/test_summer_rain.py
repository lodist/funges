"""summer_rain.factor picks the summer before each date and caps the swing."""
import numpy as np
import pandas as pd

import summer_rain


def test_factor_uses_the_summer_before_and_caps_it():
    # 2 x 2 cells, all alike; summers 1991-2020 alternate 1 and 3 mm/day (mean 2, SD 1), then
    # 2025 at 3 and 2026 at -5
    rain = np.tile(np.array([1.0, 3.0] * 15 + [3.0, -5.0])[:, None, None], (1, 2, 2))
    years = np.array([*range(1991, 2021), 2025, 2026])
    grid = {"lat": np.array([44.25, 44.0]), "lon": np.array([5.0, 5.25]), "years": years, "rain": rain}
    base = rain[:30]
    grid["z"] = (rain - base.mean(0)) / base.std(0)
    params = {"summer_rain_per_sd": 1.35, "summer_rain": grid}
    df = pd.DataFrame({"Date": pd.to_datetime(["2026-01-10", "2026-12-01", "2024-12-01", "2026-12-01"]),
                       "Latitude": [44.0, 44.0, 44.0, 50.0], "Longitude": [5.0, 5.0, 5.0, 5.0]})
    out = summer_rain.factor(df, params)
    # January: summer 2025 (+1 SD); December 2026: summer 2026 (-7 SD, held at -2);
    # a summer the grid lacks and a place outside it: neutral
    np.testing.assert_allclose(out, [1.35, 1.35 ** -2, 1.0, 1.0])
    assert summer_rain.factor(df, {"summer_rain_per_sd": 1.35}) == 1.0
