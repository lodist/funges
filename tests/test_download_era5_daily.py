"""The ERA5 training download must stay out of the nightly run's way and resume cleanly."""
from datetime import datetime
from pathlib import Path

import download_era5_daily as dl


def test_nothing_is_submitted_during_the_nightly_run():
    assert dl.seconds_until_allowed(datetime(2026, 10, 8, 0, 29)) == 0
    assert dl.seconds_until_allowed(datetime(2026, 10, 8, 0, 30)) == 5.5 * 3600
    assert dl.seconds_until_allowed(datetime(2026, 10, 8, 1, 7)) == (4 * 60 + 53) * 60
    assert dl.seconds_until_allowed(datetime(2026, 10, 8, 6, 0)) == 0


def test_every_area_year_and_statistic_is_one_block_this_year_only_to_its_last_full_month():
    blocks = dl.jobs([2025, 2026], {2026: 9})
    assert len(blocks) == 2 * len(dl.AREAS) * len(dl.STATISTICS)
    assert {tuple(b[3]) for b in blocks if b[1] == 2025} == {tuple(range(1, 13))}
    assert {tuple(b[3]) for b in blocks if b[1] == 2026} == {tuple(range(1, 10))}


def test_a_finished_block_is_never_fetched_again(tmp_path):
    folder = dl.target(tmp_path, "EU", 2025, "daily_sum", list(range(1, 13)))
    folder.mkdir(parents=True)
    (folder / ".done").write_text("x")

    class NoCalls:
        def retrieve(self, *args):
            raise AssertionError("asked Copernicus again")

    dl.fetch(NoCalls(), tmp_path, "EU", 2025, "daily_sum", list(range(1, 13)))
    assert folder == Path(tmp_path, "EU", "2025", "daily_sum_01-12")
