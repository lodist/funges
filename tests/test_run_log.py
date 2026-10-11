"""Each nightly region run leaves its console output in a log file: the scheduler keeps none."""
import os
import sys
import time

import forecast_pipeline as fp


def test_a_run_copies_its_output_and_errors_to_the_region_log(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(fp, "LOG_DIR", tmp_path)
    stdout, stderr = sys.stdout, sys.stderr
    try:
        fp.log_run_to_file("USW")
        print("Script started")
        print("Traceback (most recent call last): boom", file=sys.stderr)
        sys.stdout.flush()
    finally:
        sys.stdout, sys.stderr = stdout, stderr
    text = next(tmp_path.glob("USW_*.log")).read_text(encoding="utf-8")
    assert "Script started" in text and "boom" in text
    assert "Script started" in capsys.readouterr().out           # the console still gets it


def test_logs_older_than_a_month_are_removed(tmp_path, monkeypatch):
    monkeypatch.setattr(fp, "LOG_DIR", tmp_path)
    old, recent = tmp_path / "NE_2026-08-01.log", tmp_path / "NE_2026-10-01.log"
    for path, age_days in ((old, 40), (recent, 10)):
        path.write_text("x", encoding="utf-8")
        stamp = time.time() - age_days * 86400
        os.utime(path, (stamp, stamp))
    stdout, stderr = sys.stdout, sys.stderr
    try:
        fp.log_run_to_file("NE")
    finally:
        sys.stdout, sys.stderr = stdout, stderr
    assert not old.exists() and recent.exists()
