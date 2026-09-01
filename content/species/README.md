# Species manifests

One directory is the source of truth for each catalog entry:

```text
content/species/<id>/species.json
src/assets/species/<id>.webp
```

## Add a species

```bash
npm run species:scaffold -- --id saffron-milk-cap
# Complete every TODO and add src/assets/species/saffron-milk-cap.webp
npm run species:generate -- --id saffron-milk-cap
npm run species:check -- --id saffron-milk-cap
```

The scaffold never researches or invents biological content. Before generation,
an agent must verify the taxonomic scope, write all six locale entries, and add
an attributed WebP at the exact path in the manifest. Resize species images to
at most 512 px per side and encode at roughly WebP quality 75. Generated images
are allowed only after a human checks that the depicted diagnostic features and
the recorded source/license metadata are appropriate.

Use `--forecast` with `species:scaffold` when the species needs prediction and
map support. Every region must explicitly declare `available`. Set it to `true`
only when reviewed evidence supports an established, self-sustaining wild
population that people can realistically forage in that region. Native and
well-established naturalized populations qualify; isolated observations,
cultivated plants, and occasional garden escapes do not. GBIF can support the
review, but it is not sufficient by itself: use regional flora or mycological
authorities and record the decision's sources. A region with `available: false`
must contain no land-cover or scoring parameters and produces no score or map
layer.

Available forecast regions need explicit scoring and land-cover values. The
scoring object contains the actual temperature,
humidity, rainfall, altitude, pH, climate-zone, and fallback season parameters
consumed by the backend. Add the reviewed research sources to
`scoringReferences`; the command never invents or approves scientific values.
An empty `climate_zones` array preserves the scoring model's explicit
"unrestricted" meaning; omitting the field is invalid.

For new scoring values, research each available region separately and record
the sources used. GBIF occurrences should inform taxonomic scope, regional
distribution, fungal seasonality, and environmental calibration, alongside
literature and regional expertise; do not infer biological optima directly
from raw occurrence counts. Confirm units and plausible ranges for air/soil temperature, humidity,
rainfall, altitude, pH, season months, climate zones, and land-cover codes. The
validator catches missing fields, invalid types, and unsafe sigmas, but it
cannot establish scientific authority; parameter approval remains a human gate.

`species:generate` updates the frontend catalog, the six locale catalogs, the
shared backend registry, BioCLIP catalog input, and reconciles overlay layers
in all five map styles. Unavailable regional species are omitted from the
backend registry and their regional map layers are removed. Recipe categories
and route-to-dish score aliases also derive from the manifest catalog and
forecast metadata. It is deterministic and safe to rerun.

Existing R2 parquet files may temporarily retain an old score column until that
region's next daily pipeline run. The pipeline drops columns that are no longer
in the generated regional registry, and the recommendation generator applies
the same registry gate immediately so stale scores cannot be recommended.
The optional `--id` confirms that the requested manifest exists; generation
still reconciles the complete catalog so derived artifacts cannot drift.

`species:check` is read-only. It validates manifests and images, rejects drift,
and reports manual gates. Photo identification remains blocked until the toxic
look-alike review is approved. A vocabulary change additionally requires:

```bash
python backend/tools/bioclip_export.py --stage text-matrix
python backend/tools/bioclip_export.py --stage verify-shipped
```

The first command regenerates the index-aligned label and embedding artifacts;
the second runs the shipped safety gate. It is intentionally not part of the
ordinary generator because it downloads/loads the model and is expensive.

The manifests are the repository source of truth for scoring parameters and
land-cover mappings. `species:generate` writes the complete regional registry,
and production scoring loads it directly; the legacy `*_SPECIES_PARAMS` files
are no longer runtime inputs.

For fungi with observation-derived season curves, `forecast.empiricalSeason`
also owns the GBIF taxon keys and their references. Set `enabled` to `false`
when observation dates are not a reliable proxy for forageability (for example,
for plants whose useful growth stage differs from the reported sighting date).

Empirical regional and climate-zone season curves are derived datasets built by
`backend/tools/build_season_curves.py` from GBIF observations. They override the
manifest's reviewed `season_months` fallback when available and remain an
explicit refresh operation, as do paid weather runs. After backend scoring has
produced a parquet containing the new score column, run
`scripts/generate_worth_foraging_now.py` to refresh recommendations; its species
columns are discovered from the generated registry.

## Final verification

```bash
npm run species:check -- --id <species-id>
npm run lint
npm run test
npm run build
```

The check reports repository drift and local manual gates. Paid weather runs,
GBIF season-curve refreshes, BioCLIP embedding export, and recommendation-data
refreshes remain explicit follow-up jobs and are not silently started by the
generator.
