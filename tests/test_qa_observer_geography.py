from __future__ import annotations

import pandas as pd
import pytest

from scripts.qa_compare_resilient_scores import paired_day_bootstrap
from scripts.qa_observer_geography import AREAS, attach_country_percentiles, day_bootstrap_ci


def test_spanish_bands_use_country_code_before_latitude() -> None:
    frame = pd.DataFrame(
        {
            "country_code": ["ES", "ES", "ES", "PT"],
            "lat": [39.5, 41.0, 43.0, 41.0],
        }
    )
    selected = {
        area.key: frame.index[area.select(frame)].tolist()
        for area in AREAS
        if area.key.startswith("spain_")
    }
    assert selected == {
        "spain_south": [0],
        "spain_central": [1],
        "spain_north": [2],
    }


def test_country_percentile_is_same_day_and_weighted() -> None:
    background = pd.DataFrame(
        {
            "country_code": ["ES", "ES", "ES", "ES"],
            "date": ["2026-06-01", "2026-06-01", "2026-06-01", "2026-06-02"],
            "new_mushroom_score": [1.0, 3.0, 5.0, 9.0],
            "sample_weight": [1.0, 2.0, 1.0, 1.0],
        }
    )
    targets = pd.DataFrame(
        {
            "country_code": ["ES"],
            "date": ["2026-06-01"],
            "species_id": ["mushroom"],
            "new_score": [3.0],
        }
    )
    result = attach_country_percentiles(background, targets).iloc[0]
    assert result.country_percentile == pytest.approx(0.5)
    assert result.country_control_cells == 3


def test_day_bootstrap_is_deterministic_and_clusters_dates() -> None:
    findings = pd.DataFrame(
        {
            "date": ["2026-06-01", "2026-06-01", "2026-06-02"],
            "country_percentile": [0.1, 0.2, 0.9],
        }
    )
    first = day_bootstrap_ci(findings, iterations=500, seed=7)
    second = day_bootstrap_ci(findings, iterations=500, seed=7)
    assert first == second
    assert first[0] <= findings.country_percentile.mean() <= first[1]


def test_paired_bootstrap_preserves_a_fixed_auc_delta() -> None:
    detail = pd.DataFrame(
        {
            "date": ["2026-06-01", "2026-06-01", "2026-06-02"],
            "old_percentile": [0.2, 0.4, 0.6],
            "new_percentile": [0.3, 0.5, 0.7],
        }
    )
    interval = paired_day_bootstrap(detail, iterations=500, seed=9)["delta"]
    assert interval == pytest.approx([0.1, 0.1])
