# Species manifests

Each directory is the single source of truth for one new species. Start with:

```sh
npm run species:scaffold -- giant_puffball
```

Complete `content/species/giant_puffball/species.json`, add the WebP named by
`image` (maximum 512 × 512), then run `npm run species:generate`. The generator
updates the frontend catalog/i18n overlay, backend scoring and land-cover data,
BioCLIP vocabulary input, and all five map styles. `npm run species:check` is the
CI/agent completion gate and fails on invalid manifests or generated drift.
Apply generated scoring parameters with
`cd backend && uv run python -m funges_backend.tools.sync_species_manifests`.

`catalog.enabled` and `map.enabled` are independent. A catalog-only species does
not need scoring parameters or land-cover codes. A mapped species requires both.
Translations must contain `name`, `description`, and `howTo` for all six locales.
