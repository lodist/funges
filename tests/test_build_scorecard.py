import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from build_scorecard import MIN_FINDS, build, place_card  # noqa: E402


def season_file(tmp_path):
    path = tmp_path / "season_auc.json"
    path.write_text(json.dumps({"start": "2026-05-24", "end": "2026-10-15", "all": 0.9,
                                "species": {"mushroom": 0.92, "boletus": 0.8},
                                "rows": [{"region": "NE", "species": "mushroom", "records": 100, "locations": 50},
                                         {"region": "SE", "species": "mushroom", "records": 20, "locations": 30},
                                         {"region": "NE", "species": "boletus", "composite": True,
                                          "records": 140, "locations": 50}]}))
    return path


def test_the_page_gets_the_season_pooled_over_regions_and_no_place_figures(tmp_path):
    card = build(season_file(tmp_path))

    assert card["season"] == {"since": "2026-05-24", "until": "2026-10-15", "spots": 80,
                              "all": {"finds": 120, "auc": 0.9}, "species": {"mushroom": {"finds": 120, "auc": 0.92}}}
    assert "place" not in card                                   # composites and place stay off the page


def test_place_keeps_todays_mushrooms_and_drops_thin_species(tmp_path):
    (tmp_path / "metadata.json").write_text(json.dumps({"start": "2026-10-05", "regions": ["SE", "NE"]}))

    def rows(region, species, where, n, source="today", kingdom="Fungi", day="2026-10-12", composite=False):
        return [{"region": region, "species": species, "kingdom": kingdom, "source": source, "composite": composite,
                 "date": day, "where_absent": where}] * n

    se = rows("SE", "mushroom", 0.8, 40) + rows("SE", "morel", 0.5, 5, day="2026-10-20")
    se += rows("SE", "mushroom", 0.1, 40, source="stored") + rows("SE", "nettle", 0.1, 40, kingdom="Plantae")
    se += rows("SE", "mushroom", None, 1) + rows("SE", "boletus", 0.9, 40, composite=True)
    ne = rows("NE", "mushroom", 0.6, MIN_FINDS - 10)
    pd.DataFrame(se).to_csv(tmp_path / "finds_SE.csv", index=False)
    pd.DataFrame(ne).to_csv(tmp_path / "finds_NE.csv", index=False)

    card = place_card(tmp_path)

    # All regions together: NE's 20 porcini, too few alone, join SE's 40; morels and the composite stay out.
    porcini = {"finds": 60, "place": round((40 * 0.8 + 20 * 0.6) / 60, 3)}
    assert card["all"]["species"] == {"mushroom": porcini}
    assert card["all"]["finds"] == 65
    assert card["continents"]["EU"]["species"]["mushroom"] == porcini
    assert "US" not in card["continents"]
    assert card["since"] == "2026-10-05" and card["until"] == "2026-10-20"
    assert build(season_file(tmp_path), tmp_path)["place"] == card
