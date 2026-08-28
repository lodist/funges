from scripts.qa_model_report import DEFAULT_ROOT, render


def test_comprehensive_report_is_reproducible_from_tracked_aggregates() -> None:
    report = render(DEFAULT_ROOT)
    assert "season-discrimination AUC rose from **0.707** to **0.923**" in report
    assert "current resilient scorer reaches **0.621** AUC" in report
    assert "Southern Finland | 742" in report
    assert "Within-zone" not in report  # prose uses sentence case; avoids old report title leakage
