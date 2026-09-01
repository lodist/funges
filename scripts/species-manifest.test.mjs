import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkRepository,
  generate,
  LOCALES,
  REGIONS,
  scaffold,
  validateManifests,
} from './species-manifest.mjs';

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'chant',
    scientificName: 'Cantharellus cibarius',
    catalog: {
      enabled: true,
      order: 0,
      translationKey: 'chant',
      category: 'mushroom',
      emoji: '🍄',
      season: 'summer-fall',
      habitat: 'forest',
      image: { path: 'src/assets/species/chant.webp' },
    },
    locales: Object.fromEntries(
      LOCALES.map(locale => [
        locale,
        {
          name: `Chant ${locale}`,
          description: 'Description',
          howTo: 'Instructions',
        },
      ])
    ),
    identification: { enabled: false },
    forecast: { enabled: false },
    ...overrides,
  };
}

function entry(data, directory = data.id) {
  return {
    data,
    directory,
    filename: `content/species/${directory}/species.json`,
  };
}

function webp(width = 32, height = 32) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(22, 4);
  bytes.write('WEBPVP8X', 8);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

function scoring(overrides = {}) {
  return {
    optimal_temp: 18,
    temp_sigma: 5,
    min_temp: 5,
    max_temp: 28,
    optimal_alt: 500,
    alt_sigma: 800,
    optimal_humidity: 80,
    humidity_sigma: 15,
    optimal_pH: 6,
    pH_sigma_near: 1,
    pH_sigma_far: 2,
    pH_range_near: [5, 7],
    optimal_soil_temp: 16,
    soil_temp_sigma: 4,
    min_cumulative_rain: 20,
    weather_preference: { rain_first: true },
    climate_zones: ['temperate'],
    wind_sensitive: false,
    season_months: [6, 7, 8],
    water_relevance: false,
    sea_relevance: false,
    ...overrides,
  };
}

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funges-species-'));
  fs.mkdirSync(path.join(root, 'content/species/chant'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'content/species/chant/species.json'),
    JSON.stringify(manifest())
  );
  fs.mkdirSync(path.join(root, 'src/assets/species'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/assets/species/chant.webp'), webp());
  for (const locale of LOCALES) {
    const dir = path.join(root, `src/i18n/locales/${locale}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'species.json'),
      JSON.stringify({ title: 'preserved', list_of_species: {} })
    );
  }
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  const layers = REGIONS.flatMap(region => {
    const code = region.toLowerCase();
    return [
      {
        id: `chant_${code}`,
        type: 'fill',
        source: `overlay-${code}`,
        paint: { 'fill-opacity': ['get', 'chant_score'] },
      },
      {
        id: `chant_${code}_numbers`,
        type: 'symbol',
        source: `overlay-${code}`,
        layout: { 'text-field': ['get', 'chant_score'] },
      },
    ];
  });
  const style = JSON.stringify({ version: 8, sources: {}, layers });
  for (const name of [
    'funges_style.json',
    'funges_style_dark.json',
    'funges_style_positron.json',
    'funges_style_darkmatter.json',
    'funges_style_topographic.json',
  ]) {
    fs.writeFileSync(path.join(root, 'public', name), style);
  }
  fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/data/bioclip-labels.ts'),
    "export const BIOCLIP_LABELS = [{ scientificName: 'Cantharellus cibarius', kind: 'catalog' }];\nexport const BIOCLIP_EMBEDDING_DIM = 1;\n"
  );
  fs.writeFileSync(
    path.join(root, 'src/assets/bioclip_text_embeddings.f16.bin'),
    Buffer.alloc(2)
  );
  return root;
}

function addForecastSpecies(root) {
  const data = manifest({
    id: 'new-species',
    scientificName: 'Example species',
    catalog: {
      ...manifest().catalog,
      order: 1,
      translationKey: 'new-species',
      image: { path: 'src/assets/species/new-species.webp' },
    },
    forecast: {
      enabled: true,
      empiricalSeason: {
        enabled: true,
        taxonKeys: [123],
        references: ['https://www.gbif.org/species/123'],
      },
      regions: Object.fromEntries(
        REGIONS.map(region => [
          region,
          {
            available: region !== 'USW',
            ...(region === 'USW'
              ? {}
              : {
                  landCover: [10],
                  landCoverScheme: ['NE', 'SE'].includes(region)
                    ? 'CORINE'
                    : 'NLCD',
                  scoring: scoring(),
                  scoringReferences: ['https://example.test/research'],
                }),
          },
        ])
      ),
    },
  });
  const directory = path.join(root, 'content/species/new-species');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'species.json'), JSON.stringify(data));
  fs.writeFileSync(
    path.join(root, 'src/assets/species/new-species.webp'),
    webp()
  );
}

test('accepts a complete catalog-only manifest', () => {
  assert.deepEqual(
    validateManifests([entry(manifest())], process.cwd(), {
      checkImages: false,
    }),
    []
  );
});

test('rejects ambiguous names, an unapproved safety gate, and incomplete forecast config', () => {
  const first = manifest({
    identification: {
      enabled: true,
      label: 'Cantharellus cibarius',
      rank: 'species',
      safetyReview: { status: 'pending', references: [] },
    },
  });
  const second = manifest({
    id: 'other',
    catalog: { ...manifest().catalog, order: 1, translationKey: 'other' },
    forecast: {
      enabled: true,
      regions: { NE: { available: true, landCover: [], scoring: {} } },
    },
  });
  const errors = validateManifests(
    [entry(first), entry(second)],
    process.cwd(),
    { checkImages: false }
  ).join('\n');
  assert.match(errors, /ambiguous scientific\/BioCLIP name/);
  assert.match(errors, /approved toxic-lookalike safety review/);
  assert.match(errors, /landCover is required/);
  assert.match(errors, /scoring is required/);
  assert.match(errors, /forecast\.regions\.USW is required/);
});

test('rejects duplicate IDs, incorrect image names, and oversized images', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'funges-invalid-'));
  fs.mkdirSync(path.join(root, 'src/assets/species'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/assets/species/wrong.webp'),
    webp(513, 32)
  );
  const first = manifest({
    catalog: {
      ...manifest().catalog,
      image: { path: 'src/assets/species/wrong.webp' },
    },
  });
  const second = manifest({
    catalog: { ...manifest().catalog, order: 1 },
  });
  const errors = validateManifests(
    [entry(first), entry(second, 'other')],
    root
  ).join('\n');
  assert.match(errors, /duplicate id/);
  assert.match(errors, /catalog\.image\.path must be/);
  assert.match(errors, /image is missing/);
  assert.match(errors, /at most 512px/);
});

test('scaffold chooses the next catalog order and includes every forecast region', () => {
  const root = fixtureRoot();
  const filename = scaffold('new-species', root, { forecast: true });
  const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assert.equal(data.catalog.order, 1);
  assert.equal(data.catalog.image.path, 'src/assets/species/new-species.webp');
  assert.deepEqual(Object.keys(data.forecast.regions), REGIONS);
  assert.equal(data.forecast.regions.NE.available, false);
  assert.deepEqual(Object.keys(data.forecast.regions.NE), ['available']);
});

test('generation is deterministic and preserves non-species locale content', async () => {
  const root = fixtureRoot();
  await generate(root);
  const first = fs.readFileSync(
    path.join(root, 'src/generated/species-catalog.ts'),
    'utf8'
  );
  const locale = JSON.parse(
    fs.readFileSync(path.join(root, 'src/i18n/locales/en/species.json'), 'utf8')
  );
  await generate(root);
  assert.equal(
    fs.readFileSync(
      path.join(root, 'src/generated/species-catalog.ts'),
      'utf8'
    ),
    first
  );
  assert.equal(locale.title, 'preserved');
  assert.equal(locale.list_of_species.chant.name, 'Chant en');
});

test('forecast generation emits only available regional parameters and map layers', async () => {
  const root = fixtureRoot();
  addForecastSpecies(root);
  await generate(root);
  const registry = JSON.parse(
    fs.readFileSync(
      path.join(root, 'backend/generated/species_registry.json'),
      'utf8'
    )
  );
  assert.deepEqual(
    registry.species['new-species'].regions.NE.scoring,
    scoring()
  );
  assert.equal('USW' in registry.species['new-species'].regions, false);
  const routeConfig = fs.readFileSync(
    path.join(root, 'src/generated/route-to-dish-species.ts'),
    'utf8'
  );
  assert.match(routeConfig, /new-species_score/);
  assert.match(routeConfig, /Chant en/);
  for (const name of [
    'funges_style.json',
    'funges_style_dark.json',
    'funges_style_positron.json',
    'funges_style_darkmatter.json',
    'funges_style_topographic.json',
  ]) {
    const style = JSON.parse(
      fs.readFileSync(path.join(root, 'public', name), 'utf8')
    );
    const ids = new Set(style.layers.map(layer => layer.id));
    for (const region of REGIONS.map(value => value.toLowerCase())) {
      const expected = region !== 'usw';
      assert.equal(ids.has(`new-species_${region}`), expected);
      assert.equal(ids.has(`new-species_${region}_numbers`), expected);
    }
  }
});

test('rejects scoring data for unavailable regions and temperature sentinels', () => {
  const regions = Object.fromEntries(
    REGIONS.map(region => [
      region,
      {
        available: true,
        landCover: [10],
        landCoverScheme: ['NE', 'SE'].includes(region) ? 'CORINE' : 'NLCD',
        scoring: scoring(),
        scoringReferences: ['https://example.test/research'],
      },
    ])
  );
  regions.NE = { available: false, scoring: scoring() };
  regions.USE.scoring.optimal_temp = 1000;
  const errors = validateManifests(
    [
      entry(
        manifest({
          forecast: {
            enabled: true,
            empiricalSeason: { enabled: false, taxonKeys: [], references: [] },
            regions,
          },
        })
      ),
    ],
    process.cwd(),
    { checkImages: false }
  ).join('\n');

  assert.match(errors, /NE\.scoring is not allowed when available is false/);
  assert.match(errors, /USE\.scoring\.optimal_temp must be between/);
});

test('repository check is read-only', async () => {
  const root = fixtureRoot();
  await generate(root);
  const tracked = [
    'src/generated/species-catalog.ts',
    'backend/generated/species_registry.json',
    'backend/generated/season_taxa.json',
    'backend/tools/generated_catalog.py',
    'src/i18n/locales/en/species.json',
    'public/funges_style.json',
  ];
  const before = new Map(
    tracked.map(filename => [
      filename,
      fs.readFileSync(path.join(root, filename)),
    ])
  );
  assert.deepEqual(await checkRepository(root), []);
  for (const [filename, contents] of before)
    assert.deepEqual(fs.readFileSync(path.join(root, filename)), contents);
});

test('repository check detects BioCLIP label and embedding drift', async () => {
  const root = fixtureRoot();
  await generate(root);
  fs.writeFileSync(
    path.join(root, 'src/assets/bioclip_text_embeddings.f16.bin'),
    Buffer.alloc(4)
  );
  assert.match(
    (await checkRepository(root)).join('\n'),
    /BioCLIP label\/embedding drift/
  );
});
