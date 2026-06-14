"""Regenerate the Phase 2 golden-master snapshot from the CURRENT pipeline.

Run BEFORE refactoring:  python tests/_gen_phase2_golden.py
Writes tests/fixtures/phase2_golden_scores.parquet — the forward-window species scores
the current code produces on the hermetic fixture. test_phase2_lag_dedup.py asserts the
refactored pipeline reproduces it bit-for-bit.
"""
import sys
import tempfile
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import forecast_pipeline as fp
import _phase2_fixture as fx

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "phase2_golden_scores.parquet"


def run_pipeline_scores():
    cfg = fx.config()
    with tempfile.TemporaryDirectory() as tmp:
        hist_path = str(Path(tmp) / "history.parquet")
        fx.history_df().to_parquet(hist_path, index=False)
        out = fp._merge_and_score(cfg, fx.forward_df(), fx.species_params(),
                                  fx.zone_curves(), main_data_path=hist_path)
    out = out.copy()
    out["Date"] = pd.to_datetime(out["Date"])
    fwd = out[out["Date"] >= fx.TODAY].sort_values(["Location_Id", "Date"]).reset_index(drop=True)
    return fwd[["Location_Id", "Date"] + fx.score_columns()]


if __name__ == "__main__":
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    scores = run_pipeline_scores()
    scores.to_parquet(FIXTURE, index=False)
    print(f"Wrote {len(scores)} forward score rows -> {FIXTURE}")
    print(scores.to_string())
