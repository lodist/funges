import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from build_scorecard import MIN_FINDS, build  # noqa: E402


def test_build_keeps_todays_mushrooms_and_drops_thin_species(tmp_path):
    (tmp_path / "metadata.json").write_text(json.dumps({"start": "2026-10-05", "regions": ["SE", "NE"]}))
    porcini = [0.9] * 30 + [0.5] * 10            # 30 of 40 in the top quarter
    rows = [{"species": "mushroom", "kingdom": "Fungi", "source": "today", "date": "2026-10-12", "where": w}
            for w in porcini]
    rows += [{"species": "morel", "kingdom": "Fungi", "source": "today", "date": "2026-10-20", "where": 0.8}] * 5
    rows += [{"species": "mushroom", "kingdom": "Fungi", "source": "stored", "date": "2026-10-12", "where": 0.1}] * 40
    rows += [{"species": "nettle", "kingdom": "Plantae", "source": "today", "date": "2026-10-12", "where": 0.1}] * 40
    rows += [{"species": "mushroom", "kingdom": "Fungi", "source": "today", "date": "2026-10-12", "where": None}]
    pd.DataFrame(rows).to_csv(tmp_path / "finds_SE.csv", index=False)
    pd.DataFrame(rows[:MIN_FINDS - 1]).to_csv(tmp_path / "finds_NE.csv", index=False)

    card = build(tmp_path)

    assert list(card["regions"]) == ["SE"]                   # NE has too few finds to say anything
    se = card["regions"]["SE"]
    assert se["finds"] == 45 and se["top_quarter"] == round(35 / 45, 3)
    assert se["species"] == {"mushroom": {"finds": 40, "top_quarter": 0.75}}
    assert card["since"] == "2026-10-05" and card["until"] == "2026-10-20"
