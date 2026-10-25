"""The season atlas: each place's curve from the season grid, weighted where the species is found."""
import numpy as np
import pytest
from shapely.geometry import box

import build_season_atlas as sa


def test_block_counts_flips_rows_and_sums_blocks():
    # The cache runs south to north at 0.1°, the grid north to south at 0.2°.
    counts = np.zeros((12, 4, 4), np.float32)
    counts[0, 0, 0] = 3   # the south-west corner
    counts[5, 3, 3] = 2   # the north-east corner
    b = sa.block_counts(counts, (2, 2))
    assert b.shape == (2, 2) and b[1, 0] == 3 and b[0, 1] == 2


def test_the_place_curve_leans_on_the_cells_with_records_and_peaks_at_one():
    ratio = np.zeros((12, 1, 2), np.uint8)
    ratio[8, 0, 0] = 254   # September where 3 records are
    ratio[9, 0, 1] = 254   # October where 1 is
    curve = sa.place_curve(ratio, np.array([[3.0, 1.0]]), np.ones((1, 2), bool))
    assert curve[8] == 1.0 and curve[9] == pytest.approx(1 / 3, abs=1e-3)


def test_cells_without_a_curve_are_skipped():
    ratio = np.full((12, 1, 2), 255, np.uint8)
    ratio[:, 0, 0] = 127
    assert sa.place_curve(ratio, np.ones((1, 2)), np.ones((1, 2), bool)) == [1.0] * 12


def test_cells_go_to_the_region_that_holds_their_centre():
    regions = [{"geom": box(0, 0, 1, 1)}, {"geom": box(1, 0, 2, 1)}]
    owner = sa.cell_regions(np.array([0.5, 1.5]), np.array([0.5, 1.5]), regions)
    assert owner.tolist() == [[0, 1], [-1, -1]]


def _grid(records_in_place):
    """One region over the west column of a 2x2 grid; porcini peaks in September there."""
    ratio = np.zeros((1, 12, 2, 2), np.uint8)
    ratio[0, 8] = 254
    counts = np.zeros((12, 4, 4), np.float32)
    counts[8, 0, 0] = records_in_place                   # south-west 0.1° cell: inside
    counts[8, 0, 3] = 500                                # south-east: outside
    grids = {"EU": {"lat": np.array([1.5, 0.5]), "lon": np.array([0.5, 1.5]), "species": ["mushroom"],
                    "ratio": ratio, "file": "models/x/local_season_EU.npz", "sha256": "abc"}}
    regions = [{"id": "westland", "name": "Westland", "kind": "country", "iso": "WL", "continent": "EU",
                "geom": box(0, 0, 1, 2)}]
    return grids, {"EU": {"mushroom": counts}}, regions


def test_a_species_needs_the_record_bar_in_a_place():
    atlas = sa.build(*_grid(149), bounds={"EU": (0, 0, 2, 2)})
    region = atlas["regions"][0]
    assert region["species"] == {} and not region["place"]
    atlas = sa.build(*_grid(150), bounds={"EU": (0, 0, 2, 2)})
    region = atlas["regions"][0]
    assert region["place"] and region["species"]["mushroom"]["records"] == 150
    assert region["species"]["mushroom"]["curve"][8] == 1.0
    assert atlas["continents"]["EU"]["mushroom"]["records"] == 650
    assert atlas["grids"]["EU"] == {"file": "models/x/local_season_EU.npz", "sha256": "abc"}


def test_the_place_curve_is_what_the_map_shows_not_where_finds_are():
    # Italy: the records sit in the Alps (August), most of the map peaks in September.
    grids, counts, regions = _grid(1000)            # every record in the south-west cell
    grids["EU"]["ratio"][0, 8, 0, 0] = 0            # the north-west cell peaks in October
    grids["EU"]["ratio"][0, 9, 0, 0] = 254
    curve = sa.build(grids, counts, regions, bounds={"EU": (0, 0, 2, 2)})["regions"][0]["species"]["mushroom"]["curve"]
    assert curve[8] == pytest.approx(curve[9], abs=0.01)


def test_a_region_mostly_outside_the_grid_is_no_place():
    grids, counts, regions = _grid(1000)
    regions[0]["geom"] = box(-3, 0, 1, 2)   # a quarter inside
    region = sa.build(grids, counts, regions, bounds={"EU": (0, 0, 2, 2)})["regions"][0]
    assert not region["place"]


def test_outlines_are_clipped_to_the_grid_and_rounded():
    grids, counts, regions = _grid(150)
    regions[0]["geom"] = box(-1, 0, 1.123456, 2)
    rings = sa.build(grids, counts, regions, bounds={"EU": (0, 0, 2, 2)})["regions"][0]["rings"]
    lons = [p[0] for ring in rings for p in ring]
    assert min(lons) == 0 and max(lons) == 1.12


def test_enclaves_are_not_holes():
    italy = box(0, 0, 2, 2).difference(box(0.9, 0.9, 1.1, 1.1))   # a Vatican in the middle
    (ring,) = sa.rings(italy)
    assert sorted(map(tuple, ring[:-1])) == [(0.0, 0.0), (0.0, 2.0), (2.0, 0.0), (2.0, 2.0)]


def test_slugs():
    assert sa.slug("Bosnia and Herzegovina") == "bosnia-and-herzegovina"
    assert sa.slug("Côte d’Ivoire") == "cote-divoire"
    assert sa.slug("St. George's Mushroom") == "st-georges-mushroom"
