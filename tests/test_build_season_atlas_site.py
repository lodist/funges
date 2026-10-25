"""The season atlas files the site serves: coloured month frames and each place's JSON."""
import json

import numpy as np
from PIL import Image

from scripts import build_season_atlas_site as site


def _grid():
    ratio = np.zeros((1, 12, 3, 4), np.uint8)
    ratio[0, 8] = 254
    ratio[0, :, 0, 0] = 255   # a cell without a curve
    return {"EU": {"lat": np.array([2.5, 1.5, 0.5]), "lon": np.array([0.5, 1.5, 2.5, 3.5]),
                   "species": ["mushroom"], "ratio": ratio}}


def _atlas():
    curve = [0.0] * 8 + [1.0, 0.5, 0.0, 0.0]
    return {"grids": {}, "continents": {"EU": {"mushroom": {"records": 900, "curve": curve}}},
            "regions": [
                {"id": "westland", "name": "Westland", "kind": "country", "iso": "WL", "continent": "EU",
                 "place": True, "bbox": [0.2, 0.2, 1.8, 1.8], "rings": [[[0.2, 0.2], [1.8, 0.2], [1.8, 1.8], [0.2, 0.2]]],
                 "species": {"mushroom": {"records": 400, "curve": curve}}},
                {"id": "eastland", "name": "Eastland", "kind": "country", "iso": "EL", "continent": "EU",
                 "place": False, "bbox": [3, 0, 4, 3], "rings": [[[3, 0], [4, 0], [4, 3], [3, 0]]], "species": {}}]}


def test_frames_stack_the_months_and_light_up_the_peak():
    ratio = np.zeros((12, 2, 3), np.uint8)
    ratio[8] = 254
    ratio[0, 0, 0] = 255
    frames = site.sprite(ratio)
    assert frames.shape == (24, 3, 4)
    assert tuple(frames[16, 0, :3]) == site.hex_rgb("#e3f4ee")   # September, the peak: near-white
    assert tuple(frames[0, 1, :3]) == site.hex_rgb("#082a24")    # January, nothing: dark teal
    assert frames[0, 0, 3] == 0 and frames[0, 1, 3] == 255        # no curve: transparent


def test_a_crop_keeps_one_cell_around_the_place():
    g = _grid()["EU"]
    rows, cols, extent = site.crop(g["lat"], g["lon"], [0.2, 0.2, 1.8, 1.8])
    assert (rows, cols) == (slice(0, 3), slice(0, 3))
    assert extent == [0.0, 0.0, 3.0, 3.0]


def test_the_site_lists_continents_first_and_only_places(tmp_path):
    site.write_site(_atlas(), _grid(), tmp_path, {"mushroom": "porcini"})
    index = json.loads((tmp_path / "index.json").read_text())
    assert [p["id"] for p in index["places"]] == ["europe", "westland"]
    assert index["slugs"] == {"mushroom": "porcini"}
    place = json.loads((tmp_path / "westland.json").read_text())
    assert place["extent"] == [0.0, 0.0, 3.0, 3.0] and place["frame"] == [3, 3]
    assert place["species"]["mushroom"]["records"] == 400
    europe = json.loads((tmp_path / "europe.json").read_text())
    assert len(europe["land"]) == 2 and europe["frame"] == [4, 3]   # every region's outline
    with Image.open(tmp_path / "westland" / "mushroom.webp") as im:
        assert im.size == (3, 36)


def test_species_slugs_come_from_the_english_names():
    registry = {"species": {"st_george": {"name": "St. George's Mushroom"}, "morel": {"name": "Morchella"}}}
    assert site.species_slugs(registry) == {"st_george": "st-georges-mushroom", "morel": "morel"}
