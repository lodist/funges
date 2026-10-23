import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from build_scorecard import MIN_FINDS, build  # noqa: E402


def test_build_keeps_todays_mushrooms_and_drops_thin_species(tmp_path):
    (tmp_path / "metadata.json").write_text(json.dumps({"start": "2026-10-05", "regions": ["SE", "NE"]}))

    def rows(region, species, where, n, source="today", kingdom="Fungi", day="2026-10-12"):
        return [{"region": region, "species": species, "kingdom": kingdom, "source": source,
                 "date": day, "where": where}] * n

    se = rows("SE", "mushroom", 0.8, 40) + rows("SE", "morel", 0.5, 5, day="2026-10-20")
    se += rows("SE", "mushroom", 0.1, 40, source="stored") + rows("SE", "nettle", 0.1, 40, kingdom="Plantae")
    se += rows("SE", "mushroom", None, 1)
    ne = rows("NE", "mushroom", 0.6, MIN_FINDS - 10)
    pd.DataFrame(se).to_csv(tmp_path / "finds_SE.csv", index=False)
    pd.DataFrame(ne).to_csv(tmp_path / "finds_NE.csv", index=False)

    card = build(tmp_path)

    # All regions together: NE's 20 porcini, too few alone, join SE's 40; the 5 morels stay out.
    porcini = {"finds": 60, "place": round((40 * 0.8 + 20 * 0.6) / 60, 3)}
    assert card["all"]["species"] == {"mushroom": porcini}
    assert card["all"]["finds"] == 65 and card["all"]["from"] == ["NE", "SE"]
    assert card["continents"]["EU"]["species"]["mushroom"] == porcini
    assert "US" not in card["continents"]
    assert card["since"] == "2026-10-05" and card["until"] == "2026-10-20"
