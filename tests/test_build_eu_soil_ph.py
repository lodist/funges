import numpy as np
import pandas as pd

from build_eu_soil_ph import coord_ph


def test_coordinate_takes_the_median_of_its_base_points_else_its_own_pixel():
    ph = {(1.0, 1.0): 4.0, (1.1, 1.0): 5.0, (1.2, 1.0): 6.0, (1.3, 1.0): 7.0,
          (2.0, 2.0): 5.5, (3.0, 3.0): 6.5, (3.1, 3.0): np.nan}

    def sample(lat, lon):
        return np.array([ph[(a, b)] for a, b in zip(lat, lon)])

    static = pd.DataFrame({"Latitude": [1.0, 2.0, 3.0], "Longitude": [1.0, 2.0, 3.0]})
    base = pd.DataFrame({"Latitude": [1.1, 1.2, 1.3, 3.1], "Longitude": [1.0, 1.0, 1.0, 3.0],
                         "coord_lat": [1.0, 1.0, 1.0, 3.0], "coord_lon": [1.0, 1.0, 1.0, 3.0]})
    # mapped -> median of its points; unmapped -> own pixel; points all off land -> own pixel
    assert coord_ph(static, base, sample).tolist() == [6.0, 5.5, 6.5]
