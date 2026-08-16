# GBIF score QA

Period: **2026-06-13 to 2026-08-12** (inclusive)

## Result

The defensible primary result covers **812 in-season fungal observations across 3 taxa**. Its observation-weighted within-zone AUC is **0.556** (95% day-bootstrap CI **0.536–0.576**) and its species-macro average is **0.558**. 0.5 is random ranking. This is a presence-background diagnostic, not a true presence/absence AUC.

## Priority findings

- Strong in-season fungal ranking (AUC ≥0.60): none.
- Weak in-season fungal ranking (AUC <0.45): none.
- Plant rows are habitat-only diagnostics. GBIF plant presence does not establish edible phenophase, so plant results are not used in the model verdict or calibration claims.
- Out-of-season taxa—including spring asparagus and autumn chestnut—are explicitly excluded rather than scored as failures.
- The catalog label `Burgundy Truffle` is paired with [`Tuber melanosporum`](https://www.gbif.org/species/5258468); GBIF calls that Black Périgord Truffle, while [`Tuber aestivum`](https://www.gbif.org/species/5258469) includes the Burgundy-truffle synonym `T. uncinatum`. No usable `T. melanosporum` observations were available in this window.

| Species | Evidence | All | In season | Days | Median | ≥4 | Zone AUC (95% day-bootstrap CI) | Status |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Dandelion | habitat-only | 1478 | 1478 | 45 | 3.65 | 41.1% | 0.407 (0.374–0.44) | proxy-only |
| Raspberry | habitat-only | 1380 | 1380 | 56 | 5.92 | 88.3% | 0.442 (0.424–0.459) | proxy-only |
| Wild Strawberry | habitat-only | 1284 | 1260 | 49 | 6.38 | 93.6% | 0.446 (0.424–0.469) | proxy-only |
| Nettle | habitat-only | 1166 | 1166 | 56 | 4.81 | 67.4% | 0.415 (0.375–0.453) | proxy-only |
| Lingonberry | habitat-only | 1293 | 715 | 36 | 6.43 | 90.6% | 0.467 (0.433–0.5) | proxy-only |
| Sorrel | habitat-only | 1257 | 689 | 18 | 5.95 | 94.3% | 0.506 (0.472–0.536) | proxy-only |
| Chanterelle | fruiting-proxy | 460 | 382 | 52 | 6.46 | 96.1% | 0.564 (0.531–0.596) | testable |
| Porcini | fruiting-proxy | 451 | 357 | 54 | 5.82 | 73.9% | 0.545 (0.516–0.575) | testable |
| Amaranth | habitat-only | 303 | 303 | 54 | 6.16 | 72.9% | 0.627 (0.569–0.683) | proxy-only |
| Black Chanterelle | fruiting-proxy | 92 | 73 | 31 | 3.86 | 46.6% | 0.565 (0.499–0.623) | testable |
| Masterwort | habitat-only | 72 | 72 | 33 | 5.82 | 79.2% | 0.701 (0.646–0.755) | proxy-only |
| Parasol Mushroom | fruiting-proxy | 68 | 3 | 3 | 5.8 | 66.7% | 0.699 | low-sample |
| Wild Garlic | habitat-only | 133 | 0 | 0 | — | — | — | not-testable-in-window |
| Burgundy Truffle | fruiting-proxy | 0 | 0 | 0 | — | — | — | taxonomy-blocked |
| Wild Walnut | habitat-only | 959 | 0 | 0 | — | — | — | not-testable-in-window |
| Wild Asparagus | habitat-only | 79 | 0 | 0 | — | — | — | not-testable-in-window |
| Chestnut | habitat-only | 1134 | 0 | 0 | — | — | — | not-testable-in-window |
| Morel | fruiting-proxy | 17 | 0 | 0 | — | — | — | not-testable-in-window |
| Chickweed | habitat-only | 634 | 0 | 0 | — | — | — | not-testable-in-window |
| Artichoke | habitat-only | 209 | 0 | 0 | — | — | — | not-testable-in-window |
| St. George's Mushroom | fruiting-proxy | 24 | 0 | 0 | — | — | — | not-testable-in-window |

## In-season fungal results by region

| Region | Species | n | Days | Median score | Zone AUC |
|---|---|---:|---:|---:|---:|
| NE | Porcini | 143 | 50 | 6.35 | 0.503 |
| NE | Parasol Mushroom | 1 | 1 | 5.8 | 0.915 |
| NE | Chanterelle | 365 | 52 | 6.48 | 0.558 |
| SE | Porcini | 37 | 18 | 6.12 | 0.686 |
| SE | Parasol Mushroom | 2 | 2 | 4.47 | 0.591 |
| SE | Chanterelle | 8 | 7 | 6.55 | 0.842 |
| USE | Porcini | 97 | 40 | 5.53 | 0.587 |
| USE | Black Chanterelle | 73 | 31 | 3.86 | 0.565 |
| USE | Chanterelle | 9 | 9 | 4.84 | 0.58 |
| USW | Porcini | 80 | 28 | 1.76 | 0.502 |

## Method and caveats

GBIF records were required to be present, coordinate-bearing, and free of flagged geospatial issues. Records were deduplicated by species, day, region, and coordinates rounded to 0.01°. Each was matched to the nearest production grid point on the same day. Matches over 75 km were excluded. Fungi were eligible only when their interpolated R2 zone/region curve was ≥0.8; plants only during their production `season_months`. The AUC-like value is the mean percentile of occurrence scores among background points on the same date, in the same region and climate zone. This controls for the season multiplier rather than rewarding the model for reproducing it. Queries with more than 1,500 results were sampled at five evenly spaced API offsets (up to GBIF's 100,000-offset ceiling); smaller result sets were fetched completely.

The fungal curves were themselves derived from 2020–2026 GBIF monthly ratios, so they define eligibility but cannot independently validate seasonality. GBIF is presence-only and strongly affected by observer effort, taxonomic ambiguity, reporting lag, and duplicate datasets. Scores describe fruiting/foraging conditions, while plant records may describe vegetative plants rather than harvest readiness. Results with n < 10 are too small to interpret.

## Run metadata

```json
{
  "exclusion_distance_km": 75,
  "gbif_api": "https://api.gbif.org/v1",
  "gbif_deduplicated_records": 16376,
  "gbif_raw_api_counts": {
    "amaranth": {
      "NE": {
        "sampled": 479,
        "total": 479
      },
      "SE": {
        "sampled": 48,
        "total": 48
      },
      "USE": {
        "sampled": 10,
        "total": 10
      },
      "USW": {
        "sampled": 10,
        "total": 10
      }
    },
    "artichoke": {
      "NE": {
        "sampled": 93,
        "total": 93
      },
      "SE": {
        "sampled": 22,
        "total": 22
      },
      "USE": {
        "sampled": 5,
        "total": 5
      },
      "USW": {
        "sampled": 106,
        "total": 106
      }
    },
    "asparagus": {
      "NE": {
        "sampled": 0,
        "total": 0
      },
      "SE": {
        "sampled": 86,
        "total": 86
      },
      "USE": {
        "sampled": 0,
        "total": 0
      },
      "USW": {
        "sampled": 0,
        "total": 0
      }
    },
    "black_chant": {
      "NE": {
        "sampled": 6,
        "total": 6
      },
      "SE": {
        "sampled": 6,
        "total": 6
      },
      "USE": {
        "sampled": 91,
        "total": 91
      },
      "USW": {
        "sampled": 0,
        "total": 0
      }
    },
    "chant": {
      "NE": {
        "sampled": 608,
        "total": 608
      },
      "SE": {
        "sampled": 9,
        "total": 9
      },
      "USE": {
        "sampled": 11,
        "total": 11
      },
      "USW": {
        "sampled": 0,
        "total": 0
      }
    },
    "chestnut": {
      "NE": {
        "sampled": 1333,
        "total": 1333
      },
      "SE": {
        "sampled": 173,
        "total": 173
      },
      "USE": {
        "sampled": 0,
        "total": 0
      },
      "USW": {
        "sampled": 2,
        "total": 2
      }
    },
    "chickweed": {
      "NE": {
        "sampled": 765,
        "total": 765
      },
      "SE": {
        "sampled": 4,
        "total": 4
      },
      "USE": {
        "sampled": 18,
        "total": 18
      },
      "USW": {
        "sampled": 22,
        "total": 22
      }
    },
    "dandelion": {
      "NE": {
        "sampled": 1500,
        "total": 2100
      },
      "SE": {
        "sampled": 97,
        "total": 97
      },
      "USE": {
        "sampled": 431,
        "total": 431
      },
      "USW": {
        "sampled": 336,
        "total": 336
      }
    },
    "garlic": {
      "NE": {
        "sampled": 187,
        "total": 187
      },
      "SE": {
        "sampled": 27,
        "total": 27
      },
      "USE": {
        "sampled": 0,
        "total": 0
      },
      "USW": {
        "sampled": 0,
        "total": 0
      }
    },
    "lingonb": {
      "NE": {
        "sampled": 1500,
        "total": 2450
      },
      "SE": {
        "sampled": 204,
        "total": 204
      },
      "USE": {
        "sampled": 166,
        "total": 166
      },
      "USW": {
        "sampled": 175,
        "total": 175
      }
    },
    "masterwort": {
      "NE": {
        "sampled": 50,
        "total": 50
      },
      "SE": {
        "sampled": 78,
        "total": 78
      },
      "USE": {
        "sampled": 0,
        "total": 0
      },
      "USW": {
        "sampled": 0,
        "total": 0
      }
    },
    "morel": {
      "NE": {
        "sampled": 9,
        "total": 9
      },
      "SE": {
        "sampled": 0,
        "total": 0
      },
      "USE": {
        "sampled": 1,
        "total": 1
      },
      "USW": {
        "sampled": 9,
        "total": 9
      }
    },
    "mushroom": {
      "NE": {
        "sampled": 371,
        "total": 371
      },
      "SE": {
        "sampled": 51,
        "total": 51
      },
      "USE": {
        "sampled": 128,
        "total": 128
      },
      "USW": {
        "sampled": 139,
        "total": 139
      }
    },
    "nettle": {
      "NE": {
        "sampled": 1500,
        "total": 6984
      },
      "SE": {
        "sampled": 320,
        "total": 320
      },
      "USE": {
        "sampled": 4,
        "total": 4
      },
      "USW": {
        "sampled": 4,
        "total": 4
      }
    },
    "parasol": {
      "NE": {
        "sampled": 110,
        "total": 110
      },
      "SE": {
        "sampled": 9,
        "total": 9
      },
      "USE": {
        "sampled": 0,
        "total": 0
      },
      "USW": {
        "sampled": 0,
        "total": 0
      }
    },
    "raspberry": {
      "NE": {
        "sampled": 1500,
        "total": 2381
      },
      "SE": {
        "sampled": 95,
        "total": 95
      },
      "USE": {
        "sampled": 342,
        "total": 342
      },
      "USW": {
        "sampled": 179,
        "total": 179
      }
    },
    "sorrel": {
      "NE": {
        "sampled": 1500,
        "total": 1762
      },
      "SE": {
        "sampled": 3,
        "total": 3
      },
      "USE": {
        "sampled": 0,
        "total": 0
      },
      "USW": {
        "sampled": 0,
        "total": 0
      }
    },
    "st_george": {
      "NE": {
        "sampled": 27,
        "total": 27
      },
      "SE": {
        "sampled": 1,
        "total": 1
      },
      "USE": {
        "sampled": 0,
        "total": 0
      },
      "USW": {
        "sampled": 0,
        "total": 0
      }
    },
    "strawberry": {
      "NE": {
        "sampled": 1500,
        "total": 2190
      },
      "SE": {
        "sampled": 140,
        "total": 140
      },
      "USE": {
        "sampled": 68,
        "total": 68
      },
      "USW": {
        "sampled": 152,
        "total": 152
      }
    },
    "truffle_b": {
      "NE": {
        "sampled": 0,
        "total": 0
      },
      "SE": {
        "sampled": 0,
        "total": 0
      },
      "USE": {
        "sampled": 0,
        "total": 0
      },
      "USW": {
        "sampled": 0,
        "total": 0
      }
    },
    "walnut": {
      "NE": {
        "sampled": 1500,
        "total": 1993
      },
      "SE": {
        "sampled": 163,
        "total": 163
      },
      "USE": {
        "sampled": 1,
        "total": 1
      },
      "USW": {
        "sampled": 9,
        "total": 9
      }
    }
  },
  "period": {
    "end": "2026-08-12",
    "start": "2026-06-13"
  },
  "primary_fungal_result": {
    "active_days": 58,
    "day_bootstrap_ci": [
      0.536,
      0.576
    ],
    "n": 812,
    "species_ids": [
      "black_chant",
      "chant",
      "mushroom"
    ],
    "weighted_auc": 0.556
  },
  "r2": {
    "NE": {
      "dates_seen": 61,
      "grid_points": 66936,
      "max_points_per_day": 66936,
      "min_points_per_day": 66936,
      "row_groups": 9,
      "rows": 8496542,
      "source_url": "https://data.fung.es/EU/NE/NE_weather_data.parquet"
    },
    "SE": {
      "dates_seen": 61,
      "grid_points": 101447,
      "max_points_per_day": 101447,
      "min_points_per_day": 101447,
      "row_groups": 13,
      "rows": 12883769,
      "source_url": "https://data.fung.es/EU/SE/SE_weather_data.parquet"
    },
    "USE": {
      "dates_seen": 61,
      "grid_points": 71157,
      "max_points_per_day": 71157,
      "min_points_per_day": 71157,
      "row_groups": 9,
      "rows": 8965782,
      "source_url": "https://data.fung.es/USA/USE/USE_weather_data.parquet"
    },
    "USW": {
      "dates_seen": 61,
      "grid_points": 108586,
      "max_points_per_day": 108586,
      "min_points_per_day": 108586,
      "row_groups": 13,
      "rows": 13573250,
      "source_url": "https://data.fung.es/USA/USW/USW_weather_data.parquet"
    }
  },
  "season_filter": {
    "fungi_curve_sources": {
      "NE": {
        "region": "https://data.fung.es/EU/NE/NE_season_curves.json",
        "zone": "https://data.fung.es/EU/EU_zone_season_curves.json"
      },
      "SE": {
        "region": "https://data.fung.es/EU/SE/SE_season_curves.json",
        "zone": "https://data.fung.es/EU/EU_zone_season_curves.json"
      },
      "USE": {
        "region": "https://data.fung.es/USA/USE/USE_season_curves.json",
        "zone": "https://data.fung.es/USA/US_zone_season_curves.json"
      },
      "USW": {
        "region": "https://data.fung.es/USA/USW/USW_season_curves.json",
        "zone": "https://data.fung.es/USA/US_zone_season_curves.json"
      }
    },
    "fungi_curve_threshold": 0.8,
    "plant_month_sources": {
      "NE": "https://data.fung.es/EU/NE/NE_species_params.txt",
      "SE": "https://data.fung.es/EU/SE/SE_species_params.txt",
      "USE": "https://data.fung.es/USA/USE/USE_species_params.txt",
      "USW": "https://data.fung.es/USA/USW/USW_species_params.txt"
    },
    "plant_season_months": {
      "NE": {
        "amaranth": [
          5,
          6,
          7,
          8,
          9,
          10,
          11
        ],
        "artichoke": [
          3,
          4,
          5
        ],
        "asparagus": [
          3,
          4,
          5
        ],
        "chestnut": [
          10,
          11
        ],
        "chickweed": [
          1,
          2,
          3,
          4,
          10,
          11,
          12
        ],
        "dandelion": [
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11
        ],
        "garlic": [
          3,
          4,
          5
        ],
        "lingonb": [
          7,
          8,
          9,
          10
        ],
        "masterwort": [
          6,
          7,
          8
        ],
        "nettle": [
          4,
          5,
          6,
          7,
          8,
          9,
          10
        ],
        "raspberry": [
          6,
          7,
          8
        ],
        "sorrel": [
          3,
          4,
          5,
          6,
          9,
          10,
          11
        ],
        "strawberry": [
          5,
          6,
          7
        ],
        "walnut": [
          10,
          11
        ]
      },
      "SE": {
        "amaranth": [
          5,
          6,
          7,
          8,
          9,
          10,
          11
        ],
        "artichoke": [
          3,
          4,
          5
        ],
        "asparagus": [
          3,
          4,
          5
        ],
        "chestnut": [
          10,
          11
        ],
        "chickweed": [
          1,
          2,
          3,
          4,
          10,
          11,
          12
        ],
        "dandelion": [
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11
        ],
        "garlic": [
          3,
          4,
          5
        ],
        "lingonb": [
          7,
          8,
          9,
          10
        ],
        "masterwort": [
          6,
          7,
          8
        ],
        "nettle": [
          4,
          5,
          6,
          7,
          8,
          9,
          10
        ],
        "raspberry": [
          6,
          7,
          8
        ],
        "sorrel": [
          3,
          4,
          5,
          6,
          9,
          10,
          11
        ],
        "strawberry": [
          5,
          6,
          7
        ],
        "walnut": [
          10,
          11
        ]
      },
      "USE": {
        "amaranth": [
          5,
          6,
          7,
          8,
          9,
          10,
          11
        ],
        "artichoke": [
          3,
          4,
          5
        ],
        "asparagus": [
          3,
          4,
          5
        ],
        "chestnut": [
          10,
          11
        ],
        "chickweed": [
          1,
          2,
          3,
          4,
          10,
          11,
          12
        ],
        "dandelion": [
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11
        ],
        "garlic": [
          3,
          4,
          5
        ],
        "lingonb": [
          7,
          8,
          9,
          10
        ],
        "masterwort": [
          12
        ],
        "nettle": [
          4,
          5,
          6,
          7,
          8,
          9,
          10
        ],
        "raspberry": [
          6,
          7,
          8
        ],
        "sorrel": [
          3,
          4,
          5,
          6,
          9,
          10,
          11
        ],
        "strawberry": [
          5,
          6,
          7
        ],
        "walnut": [
          10,
          11
        ]
      },
      "USW": {
        "amaranth": [
          5,
          6,
          7,
          8,
          9,
          10,
          11
        ],
        "artichoke": [
          3,
          4,
          5
        ],
        "asparagus": [
          3,
          4,
          5
        ],
        "chestnut": [
          10,
          11
        ],
        "chickweed": [
          1,
          2,
          3,
          4,
          10,
          11,
          12
        ],
        "dandelion": [
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11
        ],
        "garlic": [
          3,
          4,
          5
        ],
        "lingonb": [
          7,
          8,
          9,
          10
        ],
        "masterwort": [
          12
        ],
        "nettle": [
          4,
          5,
          6,
          7,
          8,
          9,
          10
        ],
        "raspberry": [
          6,
          7,
          8
        ],
        "sorrel": [
          3,
          4,
          5,
          6,
          9,
          10,
          11
        ],
        "strawberry": [
          5,
          6,
          7
        ],
        "walnut": [
          10,
          11
        ]
      }
    }
  },
  "taxon_matches": {
    "amaranth": {
      "confidence": 99,
      "matched_name": "Amaranthus retroflexus L.",
      "query_name": "Amaranthus retroflexus",
      "rank": "SPECIES",
      "taxon_key": 6109534
    },
    "artichoke": {
      "confidence": 99,
      "matched_name": "Cynara cardunculus L.",
      "query_name": "Cynara cardunculus",
      "rank": "SPECIES",
      "taxon_key": 3112364
    },
    "asparagus": {
      "confidence": 99,
      "matched_name": "Asparagus acutifolius L.",
      "query_name": "Asparagus acutifolius",
      "rank": "SPECIES",
      "taxon_key": 2768995
    },
    "black_chant": {
      "confidence": 99,
      "matched_name": "Craterellus cornucopioides (L.) Pers.",
      "query_name": "Craterellus cornucopioides",
      "rank": "SPECIES",
      "taxon_key": 2554662
    },
    "chant": {
      "confidence": 99,
      "matched_name": "Cantharellus cibarius Fr.",
      "query_name": "Cantharellus cibarius",
      "rank": "SPECIES",
      "taxon_key": 5249504
    },
    "chestnut": {
      "confidence": 99,
      "matched_name": "Castanea sativa Mill.",
      "query_name": "Castanea sativa",
      "rank": "SPECIES",
      "taxon_key": 5333294
    },
    "chickweed": {
      "confidence": 97,
      "matched_name": "Stellaria media (L.) Vill.",
      "query_name": "Stellaria media",
      "rank": "SPECIES",
      "taxon_key": 5384604
    },
    "dandelion": {
      "confidence": 98,
      "matched_name": "Taraxacum officinale Weber ex F.H.Wigg.",
      "query_name": "Taraxacum officinale",
      "rank": "SPECIES",
      "taxon_key": 5394163
    },
    "garlic": {
      "confidence": 99,
      "matched_name": "Allium ursinum L.",
      "query_name": "Allium ursinum",
      "rank": "SPECIES",
      "taxon_key": 2857601
    },
    "lingonb": {
      "confidence": 99,
      "matched_name": "Vaccinium vitis-idaea L.",
      "query_name": "Vaccinium vitis-idaea",
      "rank": "SPECIES",
      "taxon_key": 2882835
    },
    "masterwort": {
      "confidence": 98,
      "matched_name": "Peucedanum ostruthium (L.) W.D.J.Koch",
      "query_name": "Peucedanum ostruthium",
      "rank": "SPECIES",
      "taxon_key": 3034230
    },
    "morel": {
      "confidence": null,
      "matched_name": "Morchella Dill. ex Pers.",
      "query_name": "Morchella",
      "rank": "GENUS",
      "taxon_key": 2594601
    },
    "mushroom": {
      "confidence": null,
      "matched_name": "Boletus L.",
      "query_name": "Boletus",
      "rank": "GENUS",
      "taxon_key": 8287374
    },
    "nettle": {
      "confidence": 97,
      "matched_name": "Urtica dioica L.",
      "query_name": "Urtica dioica",
      "rank": "SPECIES",
      "taxon_key": 7960979
    },
    "parasol": {
      "confidence": 99,
      "matched_name": "Macrolepiota procera (Scop.) Singer",
      "query_name": "Macrolepiota procera",
      "rank": "SPECIES",
      "taxon_key": 8914748
    },
    "raspberry": {
      "confidence": 97,
      "matched_name": "Rubus idaeus L.",
      "query_name": "Rubus idaeus",
      "rank": "SPECIES",
      "taxon_key": 2993094
    },
    "sorrel": {
      "confidence": 99,
      "matched_name": "Rumex acetosa L.",
      "query_name": "Rumex acetosa",
      "rank": "SPECIES",
      "taxon_key": 2888951
    },
    "st_george": {
      "confidence": 97,
      "matched_name": "Calocybe gambosa (Fr.) Donk",
      "query_name": "Calocybe gambosa",
      "rank": "SPECIES",
      "taxon_key": 8936224
    },
    "strawberry": {
      "confidence": 98,
      "matched_name": "Fragaria vesca L.",
      "query_name": "Fragaria vesca",
      "rank": "SPECIES",
      "taxon_key": 3029817
    },
    "truffle_b": {
      "confidence": 99,
      "matched_name": "Tuber melanosporum Vittad.",
      "query_name": "Tuber melanosporum",
      "rank": "SPECIES",
      "taxon_key": 5258468
    },
    "walnut": {
      "confidence": 99,
      "matched_name": "Juglans regia L.",
      "query_name": "Juglans regia",
      "rank": "SPECIES",
      "taxon_key": 3054368
    }
  }
}
```
