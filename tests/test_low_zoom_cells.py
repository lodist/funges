import geopandas as gpd
import numpy as np
from shapely.geometry import box

from maplayer_forecast import low_zoom_features


def test_cells_average_by_area_and_keep_the_props_rules():
    # Two pieces in one z3 cell (2 px ~ 0.18 deg): areas 1 and 3.
    gdf = gpd.GeoDataFrame({
        'porcini_score': [8.0, 4.0],
        'porcini_score_d6': [np.nan, 0.0],  # missing d6 = flat
        'morel_score': [np.nan, np.nan],     # missing = 0 everywhere -> dropped
    }, geometry=[box(2.0, 45.0, 2.01, 45.01), box(2.05, 45.05, 2.08, 45.06)], crs='EPSG:4326')
    [cell] = low_zoom_features(gdf, 3)
    assert cell['properties'] == {'porcini_score': 5.0, 'porcini_score_d6': 2.0}
    (west, south), _, (east, north) = cell['geometry']['coordinates'][0][:3]
    assert west <= 2.0 and east >= 2.08 and south <= 45.0 and north >= 45.06


def test_pieces_far_apart_get_their_own_cells():
    gdf = gpd.GeoDataFrame({'porcini_score': [6.0, 7.0]},
                           geometry=[box(2, 45, 2.01, 45.01), box(12, 40, 12.01, 40.01)], crs='EPSG:4326')
    assert len(low_zoom_features(gdf, 5)) == 2
