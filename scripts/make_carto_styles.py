#!/usr/bin/env python3
"""Generate Positron / Dark-Matter map styles from funges_style.json.

Both new styles reuse the SAME sources + the 168 forecast/species overlay layers
(the app drives those by id, so they must stay identical). Only the basemap is
swapped for a minimal CARTO-like layer set, recolored per theme.

Run from repo root:  python scripts/make_carto_styles.py
Then the files land in public/ (self-hosted, same as funges_style*.json).
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = ROOT / "public" / "funges_style.json"
BANDS = json.loads(
    (ROOT / "src" / "config" / "label-bands.json").read_text(encoding="utf-8")
)

# CARTO-ish palettes. ocean = background (shows before land tiles / as sea);
# land = earth fill on top; water = lakes/rivers/ocean polygons.
POSITRON = dict(
    name="Funges Positron",
    ocean="#d5dbdd", land="#fbfbf9", green="#e4e9de",
    water="#c9d5d9", waterway="#b7c4c9",
    boundary_country="#b0b0b0", boundary_region="#cbcbcb",
    road_major="#e4e4e0", road_medium="#eaeae7", road_minor="#efefec",
    # near-charcoal text + white halo so names stay legible over the light-tan
    # forecast polygons (medium grey washed out over them)
    label="#33373b", label_halo="#ffffff", water_label="#6d8595",
    sprite="map-assets/sprites/v4/light",
)
DARKMATTER = dict(
    name="Funges Dark Matter",
    # green=None -> no vegetation tint; Dark Matter is monochrome (Positron keeps its green)
    ocean="#0c0f11", land="#111314", green=None,
    water="#0c0f11", waterway="#1b2327",
    boundary_country="#2d2d2d", boundary_region="#232323",
    road_major="#2e2e2e", road_medium="#242424", road_minor="#1c1c1c",
    label="#a8a8a8", label_halo="#000000", water_label="#5a7280",
    sprite="map-assets/sprites/v4/dark",
)
# Natural-terrain hiking-map palette (Outdooractive/Alpine-club style): distinct
# forest/scrub/farmland/urban land-cover tones instead of one flat tint, plus
# trail=True below turns on the path/track line layer (roads source-layer,
# kind path/track) starting at a mid zoom so trail networks are visible before
# full zoom-in. NOTE: real contour lines / hillshade relief need an elevation
# (DEM) source the vector tiles don't carry — see the spec's "Out of Scope".
TOPOGRAPHIC = dict(
    name="Funges Topographic",
    ocean="#bcd6de", land="#eee3c4",
    # (kind values from the landuse source-layer, fill color) — drawn in this
    # order so forest sits visually "deepest" among the land-cover tints.
    landcover=[
        (["residential", "commercial", "industrial", "retail", "hospital",
          "university"], "#e3dcc4"),
        (["farmland", "agriculture", "farm", "orchard", "vineyard",
          "plant_nursery"], "#dccf8e"),
        (["grass", "scrub", "meadow", "heath", "wetland", "park",
          "recreation_ground", "grassland"], "#c3d093"),
        (["forest", "wood", "nature_reserve", "national_park",
          "protected_area"], "#8fac6c"),
    ],
    water="#a3cdd6", waterway="#79aeb8",
    boundary_country="#8a6d46", boundary_region="#b79f74",
    road_major="#c9773f", road_medium="#d79f66", road_minor="#e3c093",
    label="#3a2c18", label_halo="#f7f2df", water_label="#2f5b66",
    sprite="map-assets/sprites/v4/light",
    trail="#b0392c", trail_minzoom=8,
)

NAME = ["coalesce", ["get", "name:en"], ["get", "name"]]


def population_step_expr(steps):
    """['step', ['zoom'], base_expr, z1, expr1, ...] from label-bands.json steps."""
    ordered = sorted(steps, key=lambda s: s["zoom"])
    first, *rest = ordered
    expr = ["step", ["zoom"], [">=", ["get", "population"], first["population"]]]
    for s in rest:
        expr += [s["zoom"], [">=", ["get", "population"], s["population"]]]
    return expr


def basemap(p):
    """Minimal Protomaps-v4 basemap for palette p. Source id 'aws' matches ours."""

    def line(id_, sl, filt, color, width, minz=0, dash=None):
        L = {
            "id": id_, "type": "line", "source": "aws", "source-layer": sl,
            "minzoom": minz, "filter": filt,
            "layout": {"line-cap": "round", "line-join": "round"},
            "paint": {"line-color": color, "line-width": width},
        }
        if dash:
            L["paint"]["line-dasharray"] = dash
        return L

    def label(id_, sl, filt, size, color, halo, font="Noto Sans Regular",
              minz=0, maxz=None, upper=False):
        layout = {
            "text-field": NAME, "text-font": [font], "text-size": size,
            "text-max-width": 6, "text-padding": 2, "visibility": "visible",
        }
        if upper:
            layout["text-transform"] = "uppercase"
            layout["text-letter-spacing"] = 0.08
        L = {
            "id": id_, "type": "symbol", "source": "aws", "source-layer": sl,
            "minzoom": minz, "filter": filt, "layout": layout,
            "paint": {"text-color": color, "text-halo-color": halo,
                      "text-halo-width": 1.6},
        }
        if maxz is not None:
            L["maxzoom"] = maxz
        return L

    poly = ["==", ["geometry-type"], "Polygon"]
    lstr = ["==", ["geometry-type"], "LineString"]
    pt = ["==", ["geometry-type"], "Point"]
    green_kinds = ["forest", "wood", "nature_reserve", "national_park",
                   "protected_area", "park", "grass", "meadow", "scrub",
                   "grassland"]

    if p.get("landcover"):
        # Multi-category land cover (forest/scrub/farmland/urban), each its own
        # fill layer so tones can differ instead of one flat vegetation tint.
        green_layer = [
            {
                "id": f"landuse_{i}", "type": "fill", "source": "aws",
                "source-layer": "landuse",
                "filter": ["all", poly, ["match", ["get", "kind"], kinds, True, False]],
                "paint": {"fill-color": color, "fill-opacity": 0.85},
            }
            for i, (kinds, color) in enumerate(p["landcover"])
        ]
    elif p.get("green"):
        green_layer = [{
            "id": "landuse_green", "type": "fill", "source": "aws",
            "source-layer": "landuse",
            "filter": ["all", poly, ["match", ["get", "kind"], green_kinds, True, False]],
            "paint": {"fill-color": p["green"], "fill-opacity": 0.6},
        }]
    else:
        green_layer = []

    return [
        {"id": "background", "type": "background",
         "paint": {"background-color": p["ocean"]}},
        {"id": "earth", "type": "fill", "source": "aws", "source-layer": "earth",
         "filter": poly, "paint": {"fill-color": p["land"]}},
        *green_layer,
        {"id": "water", "type": "fill", "source": "aws", "source-layer": "water",
         "filter": poly, "paint": {"fill-color": p["water"]}},
        line("waterway", "water", lstr, p["waterway"],
             ["interpolate", ["linear"], ["zoom"], 9, 0.4, 12, 1.2], minz=9),

        # roads: minor -> medium -> major (drawn low to high so majors sit on top)
        line("road_minor", "roads",
             ["all", lstr, ["match", ["get", "kind"],
                            ["minor_road", "unclassified", "track"], True, False],
              ["!=", ["get", "kind_detail"], "service"]],
             p["road_minor"], ["interpolate", ["linear"], ["zoom"], 11, 0.3, 12, 0.9],
             minz=11),
        *([line("trail", "roads",
                ["all", lstr, ["match", ["get", "kind"],
                               ["path", "track"], True, False]],
                p["trail"], ["interpolate", ["linear"], ["zoom"],
                              p["trail_minzoom"], 0.6, 12, 1.6],
                minz=p["trail_minzoom"], dash=[3, 2])]
          if p.get("trail") else []),
        line("road_medium", "roads",
             ["all", lstr, ["match", ["get", "kind_detail"],
                            ["secondary", "tertiary"], True, False]],
             p["road_medium"], ["interpolate", ["linear"], ["zoom"], 8, 0.4, 12, 1.6],
             minz=8),
        line("road_major", "roads",
             ["all", lstr, ["match", ["get", "kind_detail"],
                            ["motorway", "trunk", "primary"], True, False]],
             p["road_major"], ["interpolate", ["linear"], ["zoom"], 5, 0.5, 9, 1.3, 12, 3],
             minz=5),

        # admin boundaries
        line("boundary_region", "boundaries",
             ["all", ["match", ["get", "kind"], ["region", "macroregion"], True, False],
              ["match", ["to-number", ["get", "kind_detail"]], [3, 4], True, False], lstr],
             p["boundary_region"], ["interpolate", ["linear"], ["zoom"], 4, 0.4, 12, 1],
             minz=4, dash=[2, 2]),
        line("boundary_country", "boundaries",
             ["all", ["==", ["get", "kind"], "country"],
              ["==", ["to-number", ["get", "kind_detail"]], 2], lstr],
             p["boundary_country"], ["interpolate", ["linear"], ["zoom"], 1, 0.6, 6, 1.3],
             minz=1),

        # labels
        label("water_label", "water", ["all", pt, ["has", "name"]],
              ["interpolate", ["linear"], ["zoom"], 3, 10, 8, 13],
              p["water_label"], p["label_halo"], minz=3),
        label("place_settlement", "places",
              ["all", pt, ["match", ["get", "kind_detail"],
                           ["town", "village", "hamlet", "borough", "suburb"], True, False],
               ["<", ["get", "population"], BANDS["settlement"]["populationCeiling"]],
               population_step_expr(BANDS["settlement"]["populationSteps"])],
              ["interpolate", ["linear"], ["zoom"], 7, 10, 12, 14],
              p["label"], p["label_halo"], font="Noto Sans Medium",
              minz=BANDS["settlement"]["minzoom"], maxz=BANDS["settlement"]["maxzoom"]),
        label("place_city", "places",
              ["all", pt, ["==", ["get", "kind"], "locality"],
               population_step_expr(BANDS["city"]["populationSteps"])],
              ["interpolate", ["linear"], ["zoom"], 3, 11, 10, 16],
              p["label"], p["label_halo"], font="Noto Sans Medium",
              minz=BANDS["city"]["minzoom"], maxz=BANDS["city"]["maxzoom"], upper=True),
        label("place_region", "places",
              ["all", pt, ["match", ["get", "kind"], ["region", "macroregion"], True, False]],
              ["interpolate", ["linear"], ["zoom"], 4, 10, 8, 13],
              p["label"], p["label_halo"],
              minz=BANDS["region"]["minzoom"], maxz=BANDS["region"]["maxzoom"], upper=True),
        label("place_country", "places",
              ["all", pt, ["==", ["get", "kind"], "country"]],
              ["interpolate", ["linear"], ["zoom"], 1, 11, 4, 15],
              p["label"], p["label_halo"], font="Noto Sans Medium",
              minz=BANDS["country"]["minzoom"], maxz=BANDS["country"]["maxzoom"], upper=True),
    ]


def build(theme, out):
    base = json.loads(BASE.read_text(encoding="utf-8"))
    overlays = [L for L in base["layers"]
                if str(L.get("source", "")).startswith("overlay")]

    style = {k: v for k, v in base.items() if k != "layers"}
    style["name"] = theme["name"]
    style["sprite"] = theme["sprite"]
    style["metadata"] = {"maputnik:renderer": "mlgljs",
                         "custom:based_on": "funges_style.json (CARTO recolor)"}

    # Match the original ordering: base fills/water/boundaries render BELOW the
    # forecast overlays; roads and all place labels render ABOVE them, so names
    # stay legible over the polygons.
    bm = basemap(theme)
    above = [L for L in bm
             if L.get("type") == "symbol" or L.get("source-layer") == "roads"]
    below = [L for L in bm if L not in above]
    style["layers"] = below + overlays + above

    (ROOT / "public" / out).write_text(
        json.dumps(style, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote public/{out}: {len(style['layers'])} layers "
          f"({len(overlays)} overlays kept)")


build(POSITRON, "funges_style_positron.json")
build(DARKMATTER, "funges_style_darkmatter.json")
build(TOPOGRAPHIC, "funges_style_topographic.json")
