# Candidate evaluation workflow

`scripts/qa_candidate_spatial.py` evaluates parameter changes and new static components
without editing production parameters or replacing the frozen GBIF matches.

Create a candidate JSON:

```json
{
  "name": "tree-host-v1",
  "parameter_overrides": {
    "regions": {
      "NE": {
        "species": {
          "chant": { "optimal_alt": 250, "alt_sigma": 700 }
        }
      }
    }
  },
  "components": {
    "Host": {
      "species_columns": {
        "mushroom": "mushroom_host_score",
        "chant": "chant_host_score"
      },
      "weight": 0.75
    }
  }
}
```

The optional feature CSV or Parquet file must contain `Location_Id`, or exact `Latitude`
and `Longitude`, plus the component columns. It may contain a `region` column, be a
directory containing `NE.parquet`/`SE.parquet`, or use `{region}` in its path.
Candidate component coverage must be complete by default. A spec may set an explicit
`missing_value`, but that value is a real imputation and can change the score; it is not a
mathematically neutral placeholder in a weighted geometric mean.

```bash
python scripts/qa_candidate_spatial.py \
  --candidate docs/qa/candidates/tree-host-v1.json \
  --features tmp/tree-host/{region}.parquet \
  --regions NE,SE \
  --folds 5 \
  --output tmp/tree-host-v1-results.json
```

Every result includes all five deterministic two-degree spatial folds. Explore and tune on
four folds, then run once with `--holdout-fold N` for the promotion decision. Do not select
a candidate from its holdout result. The output records hashes of the candidate and
seasonal-truth files. The first run also freezes the selected raw weather rows and a copy
of the production parameters/curves under `candidate-snapshot/`; later candidates reuse
that snapshot. Use `--refresh-history` only when intentionally starting a new evaluation
cohort.
