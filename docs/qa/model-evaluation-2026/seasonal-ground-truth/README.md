# Seasonal ground truth

The row-level `gbif-season-truth.json` artifact is generated locally and ignored
to keep collected occurrence data out of Git. Rebuild it with:

```sh
python scripts/qa_season_truth.py
```

The aggregate conclusions derived from that artifact are preserved in the
tracked model-evaluation report.
