"""Golden-master gate for coord-resolution lag computation.

The forward-window species scores produced by _merge_and_score MUST stay bit-for-bit
identical to the snapshot of the current intentional scoring behavior
(tests/fixtures/phase2_golden_scores.parquet, regenerated via tests/_gen_phase2_golden.py).

Regenerate the snapshot ONLY intentionally (never to "make the test pass").
"""
import tempfile
from pathlib import Path

import pandas as pd
import pytest

import forecast_pipeline as fp
import _phase2_fixture as fx
from _gen_phase2_golden import run_pipeline_scores

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "phase2_golden_scores.parquet"


def test_forward_scores_match_golden_master():
    """Coord-dedup path (forward frame carries the _coord_lat/_coord_lon key)."""
    golden = pd.read_parquet(FIXTURE)
    got = run_pipeline_scores()
    pd.testing.assert_frame_equal(got, golden, check_dtype=False)


def test_per_base_fallback_matches_golden_master():
    """No coord key on the forward frame (un-baked base / legacy) -> per-base lag path.
    Must still reproduce the same scores."""
    golden = pd.read_parquet(FIXTURE)
    fwd = fx.forward_df().drop(columns=["_coord_lat", "_coord_lon"])
    with tempfile.TemporaryDirectory() as tmp:
        hist_path = str(Path(tmp) / "history.parquet")
        fx.history_df().to_parquet(hist_path, index=False)
        out = fp._merge_and_score(fx.config(), fwd, fx.species_params(),
                                  fx.zone_curves(), main_data_path=hist_path)
    out["Date"] = pd.to_datetime(out["Date"])
    got = (out[out["Date"] >= fx.TODAY].sort_values(["Location_Id", "Date"]).reset_index(drop=True)
           [["Location_Id", "Date"] + fx.score_columns()])
    pd.testing.assert_frame_equal(got, golden, check_dtype=False)


def test_raw_scores_are_identical_within_each_coord(monkeypatch):
    """Coord-dedup must produce identical raw scores before spatial post-processing."""
    monkeypatch.setattr(fp, "spatial_smooth_scores", lambda frame, _cols: frame)
    got = run_pipeline_scores()
    pairs = [("B0", "B1"), ("B2", "B3"), ("B4", "B5")]
    for a, b in pairs:
        va = got[got["Location_Id"] == a].sort_values("Date")[fx.score_columns()].reset_index(drop=True)
        vb = got[got["Location_Id"] == b].sort_values("Date")[fx.score_columns()].reset_index(drop=True)
        pd.testing.assert_frame_equal(va, vb)


def test_merge_drops_historical_score_columns_without_current_parameters():
    """Unavailable species must disappear from the rewritten rolling parquet schema."""
    fwd = fx.forward_df()
    history = fx.history_df()
    history["unavailable_score"] = 9.0

    with tempfile.TemporaryDirectory() as tmp:
        hist_path = str(Path(tmp) / "history.parquet")
        history.to_parquet(hist_path, index=False)
        out = fp._merge_and_score(
            fx.config(),
            fwd,
            fx.species_params(),
            fx.zone_curves(),
            main_data_path=hist_path,
        )

    assert "unavailable_score" not in out.columns
    assert set(fx.score_columns()).issubset(out.columns)
