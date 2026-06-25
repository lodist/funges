import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from maplayer_forecast import forecast_props


def test_forecast_props_emits_only_visible_changes():
    # per_day[0] = today; indices 1.. = forecast days
    per_day = [
        {"mushroom": 6.0, "morel": 0.0, "chant": 5.0},  # d0 today
        {"mushroom": 6.0, "morel": 0.0, "chant": 5.4},  # d1: chant +0.4 (sub-threshold) -> omit
        {"mushroom": 7.0, "morel": 0.6, "chant": 5.0},  # d2: mushroom +1.0, morel 0->0.6 -> emit both
        {"mushroom": 6.0, "morel": 0.0, "chant": 0.0},  # d3: chant 5->0 drop -> emit
    ]
    props = forecast_props(per_day, threshold=0.5)
    assert props == {
        "mushroom_score_d2": 7.0,
        "morel_score_d2": 0.6,
        "chant_score_d3": 0.0,
    }


def test_forecast_props_empty_when_flat():
    per_day = [{"mushroom": 6.0}, {"mushroom": 6.0}, {"mushroom": 6.04}]
    assert forecast_props(per_day, threshold=0.5) == {}


if __name__ == "__main__":
    test_forecast_props_emits_only_visible_changes()
    test_forecast_props_empty_when_flat()
    print("OK")
