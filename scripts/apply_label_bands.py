#!/usr/bin/env python3
"""Apply the shared label-band thresholds (src/config/label-bands.json) to the
hand-authored funges_style.json / funges_style_dark.json place-label layers,
so those two files and the generated Positron/Dark-Matter/Topographic styles
(scripts/make_carto_styles.py) all read from the same zoom-band source of truth.

Run from repo root:  python scripts/apply_label_bands.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BANDS = json.loads(
    (ROOT / "src" / "config" / "label-bands.json").read_text(encoding="utf-8")
)
STYLE_FILES = ["funges_style.json", "funges_style_dark.json"]


def population_step_expr(steps):
    ordered = sorted(steps, key=lambda s: s["zoom"])
    first, *rest = ordered
    expr = ["step", ["zoom"], [">=", ["get", "population"], first["population"]]]
    for s in rest:
        expr += [s["zoom"], [">=", ["get", "population"], s["population"]]]
    return expr


def patch_filter_items(filter_list, city_steps=None, settlement_steps=None, ceiling=None):
    for i, item in enumerate(filter_list):
        if not isinstance(item, list) or not item:
            continue
        if item[0] == "step" and city_steps is not None:
            filter_list[i] = population_step_expr(city_steps)
        elif item[0] == "step" and settlement_steps is not None:
            filter_list[i] = population_step_expr(settlement_steps)
        elif item[0] == "<" and ceiling is not None:
            filter_list[i] = ["<", ["get", "population"], ceiling]


def patch_style(path):
    style = json.loads(path.read_text(encoding="utf-8"))
    by_id = {layer["id"]: layer for layer in style["layers"]}

    country = by_id["admin_label_country"]
    country["minzoom"] = BANDS["country"]["minzoom"]
    country["maxzoom"] = BANDS["country"]["maxzoom"]

    region = by_id["admin_label_region"]
    region["minzoom"] = BANDS["region"]["minzoom"]
    region["maxzoom"] = BANDS["region"]["maxzoom"]

    city = by_id["place_label_locality_city"]
    city["minzoom"] = BANDS["city"]["minzoom"]
    city["maxzoom"] = BANDS["city"]["maxzoom"]
    patch_filter_items(city["filter"], city_steps=BANDS["city"]["populationSteps"])

    settlement = by_id["place_label_locality_settlement"]
    settlement["minzoom"] = BANDS["settlement"]["minzoom"]
    settlement["maxzoom"] = BANDS["settlement"]["maxzoom"]
    patch_filter_items(
        settlement["filter"],
        settlement_steps=BANDS["settlement"]["populationSteps"],
        ceiling=BANDS["settlement"]["populationCeiling"],
    )

    settlement_small = by_id["place_label_locality_settlement_small"]
    settlement_small["minzoom"] = BANDS["settlementSmall"]["minzoom"]
    settlement_small["maxzoom"] = BANDS["settlementSmall"]["maxzoom"]

    path.write_text(json.dumps(style, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"patched {path.relative_to(ROOT)}")


if __name__ == "__main__":
    for name in STYLE_FILES:
        patch_style(ROOT / "public" / name)
