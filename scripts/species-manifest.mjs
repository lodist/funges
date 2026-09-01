#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const PRETTIER_OPTIONS =
  (await prettier.resolveConfig(fileURLToPath(import.meta.url))) || {};

export const LOCALES = ['en', 'it', 'fr', 'de', 'es', 'pt'];
export const REGIONS = ['NE', 'SE', 'USE', 'USW'];
const CATEGORIES = new Set(['mushroom', 'plant', 'berry', 'nut', 'flower']);
const ID_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const TODO_RE = /\bTODO\b/i;
const REQUIRED_SCORING_NUMBERS = [
  'optimal_temp',
  'temp_sigma',
  'min_temp',
  'max_temp',
  'optimal_alt',
  'alt_sigma',
  'optimal_humidity',
  'humidity_sigma',
  'optimal_pH',
  'pH_sigma_near',
  'pH_sigma_far',
  'optimal_soil_temp',
  'soil_temp_sigma',
  'min_cumulative_rain',
];

const rel = (...parts) => path.join(...parts);
const json = value => `${JSON.stringify(value, null, 2)}\n`;

function fail(errors, location, message) {
  errors.push(`${location}: ${message}`);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() && !TODO_RE.test(value);
}

export function webpDimensions(buffer) {
  if (
    buffer.length < 30 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error('not a WebP file');
  }
  const kind = buffer.toString('ascii', 12, 16);
  if (kind === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (kind === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (
    kind === 'VP8 ' &&
    buffer[23] === 0x9d &&
    buffer[24] === 0x01 &&
    buffer[25] === 0x2a
  ) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  throw new Error(`unsupported WebP chunk ${kind}`);
}

export function loadManifests(root = process.cwd()) {
  const base = rel(root, 'content', 'species');
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const filename = rel(base, entry.name, 'species.json');
      if (!fs.existsSync(filename))
        throw new Error(`${path.relative(root, filename)} is missing`);
      return {
        directory: entry.name,
        filename,
        data: JSON.parse(fs.readFileSync(filename, 'utf8')),
      };
    })
    .sort(
      (a, b) =>
        (a.data.catalog?.order ?? Number.MAX_SAFE_INTEGER) -
          (b.data.catalog?.order ?? Number.MAX_SAFE_INTEGER) ||
        a.data.id.localeCompare(b.data.id)
    );
}

export function validateManifests(
  entries,
  root = process.cwd(),
  { checkImages = true } = {}
) {
  const errors = [];
  const ids = new Map();
  const names = new Map();
  const orders = new Map();
  const translationKeys = new Map();
  for (const { directory, filename, data: m } of entries) {
    const where = path.relative(root, filename);
    if (m.schemaVersion !== 1) fail(errors, where, 'schemaVersion must be 1');
    if (!ID_RE.test(m.id || ''))
      fail(errors, where, 'id must be lowercase kebab/snake case');
    if (directory !== m.id)
      fail(errors, where, `directory must be named ${m.id}`);
    if (ids.has(m.id))
      fail(errors, where, `duplicate id (also in ${ids.get(m.id)})`);
    ids.set(m.id, where);
    if (!nonEmpty(m.scientificName))
      fail(errors, where, 'scientificName is required');
    const nameKey = String(
      m.identification?.label || m.scientificName || ''
    ).toLowerCase();
    const prior = names.get(nameKey);
    if (
      prior &&
      (!m.scientificNameGroup || m.scientificNameGroup !== prior.group)
    ) {
      fail(
        errors,
        where,
        `ambiguous scientific/BioCLIP name shared with ${prior.where}; add the same explicit scientificNameGroup to both intentional aliases`
      );
    } else names.set(nameKey, { where, group: m.scientificNameGroup });

    const c = m.catalog;
    if (!c || c.enabled !== true)
      fail(errors, where, 'catalog.enabled must be true');
    if (!nonEmpty(c?.translationKey))
      fail(errors, where, 'catalog.translationKey is required');
    if (!Number.isInteger(c?.order) || c.order < 0)
      fail(errors, where, 'catalog.order must be a non-negative integer');
    else if (orders.has(c.order))
      fail(
        errors,
        where,
        `duplicate catalog.order (also in ${orders.get(c.order)})`
      );
    else orders.set(c.order, where);
    if (nonEmpty(c?.translationKey)) {
      if (translationKeys.has(c.translationKey))
        fail(
          errors,
          where,
          `duplicate catalog.translationKey (also in ${translationKeys.get(c.translationKey)})`
        );
      else translationKeys.set(c.translationKey, where);
    }
    if (!CATEGORIES.has(c?.category))
      fail(errors, where, 'catalog.category is invalid');
    for (const key of ['emoji', 'season', 'habitat'])
      if (!nonEmpty(c?.[key]))
        fail(errors, where, `catalog.${key} is required`);
    if (!nonEmpty(c?.image?.path))
      fail(errors, where, 'catalog.image.path is required');
    else if (c.image.path !== `src/assets/species/${m.id}.webp`)
      fail(
        errors,
        where,
        `catalog.image.path must be src/assets/species/${m.id}.webp`
      );
    if (checkImages && nonEmpty(c?.image?.path)) {
      const imagePath = rel(root, c.image.path);
      if (!fs.existsSync(imagePath))
        fail(errors, where, `image is missing: ${c.image.path}`);
      else {
        try {
          const { width, height } = webpDimensions(fs.readFileSync(imagePath));
          if (width > 512 || height > 512)
            fail(
              errors,
              where,
              `image is ${width}x${height}; species images must be at most 512px per side`
            );
        } catch (error) {
          fail(errors, where, `${c.image.path}: ${error.message}`);
        }
      }
    }
    for (const locale of LOCALES) {
      for (const key of ['name', 'description', 'howTo']) {
        if (!nonEmpty(m.locales?.[locale]?.[key]))
          fail(errors, where, `locales.${locale}.${key} is missing or TODO`);
      }
    }

    const identification = m.identification;
    if (!identification || typeof identification.enabled !== 'boolean')
      fail(errors, where, 'identification.enabled must be boolean');
    if (identification?.enabled) {
      if (!nonEmpty(identification.label))
        fail(errors, where, 'identification.label is required when enabled');
      if (!['species', 'genus'].includes(identification.rank))
        fail(errors, where, 'identification.rank must be species or genus');
      if (identification.safetyReview?.status !== 'approved')
        fail(
          errors,
          where,
          'photo identification requires an approved toxic-lookalike safety review'
        );
      if (
        !identification.safetyReview?.references?.length ||
        identification.safetyReview.references.some(x => !nonEmpty(x))
      ) {
        fail(
          errors,
          where,
          'identification.safetyReview.references must contain reviewed sources'
        );
      }
      for (const reference of identification.safetyReview?.references || []) {
        if (
          nonEmpty(reference) &&
          !/^https?:\/\//i.test(reference) &&
          !fs.existsSync(rel(root, reference))
        )
          fail(
            errors,
            where,
            `identification safety reference is missing: ${reference}`
          );
      }
    }

    const forecast = m.forecast;
    if (!forecast || typeof forecast.enabled !== 'boolean')
      fail(errors, where, 'forecast.enabled must be boolean');
    if (forecast?.enabled) {
      if (!forecast.regions || !Object.keys(forecast.regions).length)
        fail(errors, where, 'forecast.regions is required');
      if (
        forecast.dataColumns !== undefined &&
        (!Array.isArray(forecast.dataColumns) ||
          forecast.dataColumns.some(column => !nonEmpty(column)))
      )
        fail(
          errors,
          where,
          'forecast.dataColumns must contain valid column names'
        );
      const empirical = forecast.empiricalSeason;
      if (!empirical || typeof empirical.enabled !== 'boolean')
        fail(errors, where, 'forecast.empiricalSeason.enabled must be boolean');
      if (empirical?.enabled) {
        if (
          !Array.isArray(empirical.taxonKeys) ||
          !empirical.taxonKeys.length ||
          empirical.taxonKeys.some(key => !Number.isInteger(key) || key <= 0)
        )
          fail(
            errors,
            where,
            'forecast.empiricalSeason.taxonKeys must contain GBIF taxon keys'
          );
        if (
          !Array.isArray(empirical.references) ||
          !empirical.references.length ||
          empirical.references.some(reference => !nonEmpty(reference))
        )
          fail(
            errors,
            where,
            'forecast.empiricalSeason.references must contain reviewed sources'
          );
      }
      if (
        empirical &&
        (!Array.isArray(empirical.taxonKeys) ||
          !Array.isArray(empirical.references))
      )
        fail(
          errors,
          where,
          'forecast.empiricalSeason.taxonKeys and references must be arrays'
        );
      for (const region of REGIONS)
        if (!forecast.regions?.[region])
          fail(
            errors,
            where,
            `forecast.regions.${region} is required for a forecast species`
          );
      if (
        !REGIONS.some(region => forecast.regions?.[region]?.available === true)
      )
        fail(
          errors,
          where,
          'at least one forecast region must have available set to true'
        );
      for (const [region, config] of Object.entries(forecast.regions || {})) {
        if (!REGIONS.includes(region))
          fail(errors, where, `unknown forecast region ${region}`);
        if (!config || typeof config !== 'object') {
          fail(errors, where, `forecast.regions.${region} must be an object`);
          continue;
        }
        if (typeof config.available !== 'boolean') {
          fail(
            errors,
            where,
            `forecast.regions.${region}.available must be boolean`
          );
          continue;
        }
        if (!config.available) {
          for (const key of [
            'landCover',
            'landCoverScheme',
            'scoring',
            'scoringReferences',
            'scoringSnapshotSha256',
          ])
            if (key in config)
              fail(
                errors,
                where,
                `forecast.regions.${region}.${key} is not allowed when available is false`
              );
          continue;
        }
        if (
          !Array.isArray(config.landCover) ||
          !config.landCover.length ||
          config.landCover.some(
            value =>
              !Number.isInteger(value) &&
              !(typeof value === 'string' && value.trim())
          )
        )
          fail(
            errors,
            where,
            `forecast.regions.${region}.landCover is required`
          );
        const expectedScheme = ['NE', 'SE'].includes(region)
          ? 'CORINE'
          : 'NLCD';
        if (config.landCoverScheme !== expectedScheme)
          fail(
            errors,
            where,
            `forecast.regions.${region}.landCoverScheme must be ${expectedScheme}`
          );
        const scoring = config.scoring;
        if (
          !scoring ||
          typeof scoring !== 'object' ||
          !Object.keys(scoring).length
        )
          fail(errors, where, `forecast.regions.${region}.scoring is required`);
        for (const key of REQUIRED_SCORING_NUMBERS)
          if (!Number.isFinite(scoring?.[key]))
            fail(
              errors,
              where,
              `forecast.regions.${region}.scoring.${key} must be a number`
            );
        if (
          Number.isFinite(scoring?.min_temp) &&
          Number.isFinite(scoring?.max_temp) &&
          scoring.min_temp > scoring.max_temp
        )
          fail(
            errors,
            where,
            `forecast.regions.${region}.scoring.min_temp must not exceed max_temp`
          );
        if (
          Number.isFinite(scoring?.optimal_temp) &&
          Number.isFinite(scoring?.min_temp) &&
          Number.isFinite(scoring?.max_temp) &&
          (scoring.optimal_temp < scoring.min_temp ||
            scoring.optimal_temp > scoring.max_temp)
        )
          fail(
            errors,
            where,
            `forecast.regions.${region}.scoring.optimal_temp must be between min_temp and max_temp`
          );
        for (const key of [
          'temp_sigma',
          'alt_sigma',
          'humidity_sigma',
          'pH_sigma_near',
          'pH_sigma_far',
          'soil_temp_sigma',
        ])
          if (Number.isFinite(scoring?.[key]) && scoring[key] <= 0)
            fail(
              errors,
              where,
              `forecast.regions.${region}.scoring.${key} must be greater than zero`
            );
        if (
          !Array.isArray(scoring?.pH_range_near) ||
          scoring.pH_range_near.length !== 2 ||
          scoring.pH_range_near.some(value => !Number.isFinite(value)) ||
          scoring.pH_range_near[0] > scoring.pH_range_near[1]
        )
          fail(
            errors,
            where,
            `forecast.regions.${region}.scoring.pH_range_near must contain two ordered numbers`
          );
        if (
          Number.isFinite(scoring?.min_cumulative_rain) &&
          scoring.min_cumulative_rain < 0
        )
          fail(
            errors,
            where,
            `forecast.regions.${region}.scoring.min_cumulative_rain must not be negative`
          );
        if (
          !Array.isArray(scoring?.season_months) ||
          !scoring.season_months.length ||
          scoring.season_months.some(
            month => !Number.isInteger(month) || month < 1 || month > 12
          )
        )
          fail(
            errors,
            where,
            `forecast.regions.${region}.scoring.season_months must contain months 1-12`
          );
        if (
          !Array.isArray(scoring?.climate_zones) ||
          scoring.climate_zones.some(zone => !nonEmpty(zone))
        )
          fail(
            errors,
            where,
            `forecast.regions.${region}.scoring.climate_zones must be an array of zone names (empty means unrestricted)`
          );
        for (const key of [
          'wind_sensitive',
          'water_relevance',
          'sea_relevance',
        ])
          if (typeof scoring?.[key] !== 'boolean')
            fail(
              errors,
              where,
              `forecast.regions.${region}.scoring.${key} must be boolean`
            );
        if (typeof scoring?.weather_preference?.rain_first !== 'boolean')
          fail(
            errors,
            where,
            `forecast.regions.${region}.scoring.weather_preference.rain_first must be boolean`
          );
        if (
          !Array.isArray(config.scoringReferences) ||
          !config.scoringReferences.length ||
          config.scoringReferences.some(reference => !nonEmpty(reference))
        )
          fail(
            errors,
            where,
            `forecast.regions.${region}.scoringReferences must contain reviewed sources`
          );
        if (
          config.scoringSnapshotSha256 !== undefined &&
          !/^[a-f0-9]{64}$/.test(config.scoringSnapshotSha256)
        )
          fail(
            errors,
            where,
            `forecast.regions.${region}.scoringSnapshotSha256 is invalid`
          );
      }
    }
  }
  return errors;
}

function catalogTs(manifests) {
  const rows = manifests.map(m => ({
    id: m.id,
    nameKey: `${m.catalog.translationKey}.name`,
    scientificName: m.scientificName,
    category: m.catalog.category,
    emoji: m.catalog.emoji,
    descriptionKey: `${m.catalog.translationKey}.description`,
    howToKey: `${m.catalog.translationKey}.howTo`,
    season: m.catalog.season,
    habitat: m.catalog.habitat,
    ...(m.forecast.enabled ? { showOnMap: true } : {}),
  }));
  return `// GENERATED by npm run species:generate. DO NOT EDIT.\nimport type { Species } from '@/data/species';\n\nexport const GENERATED_SPECIES_DATA: Species[] = ${JSON.stringify(rows, null, 2)};\n`;
}

function routeToDishTs(manifests) {
  const config = Object.fromEntries(
    manifests
      .filter(m => m.forecast.enabled)
      .map(m => [
        m.id,
        {
          scorePropertyAliases: [
            ...new Set([
              m.id,
              `${m.id}_score`,
              ...(m.forecast.dataColumns || []),
              m.locales.en.name,
            ]),
          ],
        },
      ])
  );
  return `// GENERATED by npm run species:generate. DO NOT EDIT.\nexport const GENERATED_ROUTE_TO_DISH_SPECIES_CONFIG = ${JSON.stringify(config, null, 2)} as const;\n`;
}

function pythonCatalog(manifests) {
  const seen = new Set();
  const rows = [];
  for (const m of manifests.filter(x => x.identification.enabled)) {
    if (seen.has(m.identification.label)) continue;
    seen.add(m.identification.label);
    rows.push([m.identification.label, m.identification.rank]);
  }
  return `# GENERATED by npm run species:generate. DO NOT EDIT.\nCATALOG = ${JSON.stringify(rows, null, 2)}\nCATALOG_NAMES = {name for name, _rank in CATALOG}\n`;
}

function backendRegistry(manifests) {
  const species = {};
  for (const m of manifests.filter(x => x.forecast.enabled)) {
    species[m.id] = {
      name: m.locales.en.name,
      scientificName: m.identification.enabled
        ? m.identification.label
        : m.scientificName.replace(/ spp\.$/, ''),
      identificationRank: m.identification.enabled
        ? m.identification.rank
        : 'species',
      empiricalTaxonKeys: m.forecast.empiricalSeason.enabled
        ? m.forecast.empiricalSeason.taxonKeys
        : [],
      dataColumns: [
        ...new Set([`${m.id}_score`, ...(m.forecast.dataColumns || [])]),
      ],
      regions: Object.fromEntries(
        Object.entries(m.forecast.regions)
          .filter(([, cfg]) => cfg.available)
          .map(([region, cfg]) => [
            region,
            {
              landCover: cfg.landCover,
              landCoverScheme: cfg.landCoverScheme,
              scoring: cfg.scoring,
              scoringReferences: cfg.scoringReferences,
              ...(cfg.scoringSnapshotSha256
                ? { scoringSnapshotSha256: cfg.scoringSnapshotSha256 }
                : {}),
            },
          ])
      ),
    };
  }
  return { schemaVersion: 1, species };
}

function seasonTaxa(manifests) {
  return Object.fromEntries(
    manifests
      .filter(m => m.forecast.enabled && m.forecast.empiricalSeason.enabled)
      .map(m => [m.id, m.forecast.empiricalSeason.taxonKeys])
  );
}

function replaceDeep(value, from, to) {
  if (typeof value === 'string') return value.replaceAll(from, to);
  if (Array.isArray(value)) return value.map(v => replaceDeep(v, from, to));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replaceDeep(v, from, to)])
    );
  return value;
}

function reconcileStyleLayers(style, forecastIdsByRegion, allForecastIds) {
  const out = structuredClone(style);
  for (const region of REGIONS.map(x => x.toLowerCase())) {
    const templateBase = out.layers.find(
      layer => layer.id === `chant_${region}`
    );
    const templateNumbers = out.layers.find(
      layer => layer.id === `chant_${region}_numbers`
    );
    if (!templateBase || !templateNumbers)
      throw new Error(`style is missing chant templates for ${region}`);
    const wantedIds = new Set(forecastIdsByRegion[region.toUpperCase()]);
    out.layers = out.layers.filter(layer => {
      for (const id of allForecastIds) {
        if (
          !wantedIds.has(id) &&
          (layer.id === `${id}_${region}` ||
            layer.id === `${id}_${region}_numbers`)
        )
          return false;
      }
      return true;
    });
    const insertion =
      out.layers.findIndex(layer => layer.id === templateNumbers.id) + 1;
    const additions = [];
    for (const id of wantedIds) {
      for (const template of [templateBase, templateNumbers]) {
        const wanted = template.id.replace('chant_', `${id}_`);
        if (!out.layers.some(layer => layer.id === wanted))
          additions.push(replaceDeep(template, 'chant_', `${id}_`));
      }
    }
    out.layers.splice(insertion, 0, ...additions);
  }
  return out;
}

export async function buildArtifacts(entries, root = process.cwd()) {
  const manifests = entries.map(x => x.data);
  const artifacts = new Map();
  artifacts.set(
    'src/generated/species-catalog.ts',
    await prettier.format(catalogTs(manifests), {
      ...PRETTIER_OPTIONS,
      parser: 'typescript',
    })
  );
  artifacts.set(
    'src/generated/route-to-dish-species.ts',
    await prettier.format(routeToDishTs(manifests), {
      ...PRETTIER_OPTIONS,
      parser: 'typescript',
    })
  );
  artifacts.set(
    'backend/generated/species_registry.json',
    await prettier.format(json(backendRegistry(manifests)), {
      ...PRETTIER_OPTIONS,
      parser: 'json',
    })
  );
  artifacts.set(
    'backend/generated/season_taxa.json',
    await prettier.format(json(seasonTaxa(manifests)), {
      ...PRETTIER_OPTIONS,
      parser: 'json',
    })
  );
  artifacts.set('backend/tools/generated_catalog.py', pythonCatalog(manifests));

  for (const locale of LOCALES) {
    const filename = rel(
      root,
      'src',
      'i18n',
      'locales',
      locale,
      'species.json'
    );
    const current = JSON.parse(fs.readFileSync(filename, 'utf8'));
    current.list_of_species = Object.fromEntries(
      manifests.map(m => [m.catalog.translationKey, m.locales[locale]])
    );
    artifacts.set(
      path.relative(root, filename),
      await prettier.format(json(current), {
        ...PRETTIER_OPTIONS,
        parser: 'json',
      })
    );
  }

  return artifacts;
}

const STYLE_NAMES = [
  'funges_style.json',
  'funges_style_dark.json',
  'funges_style_positron.json',
  'funges_style_darkmatter.json',
  'funges_style_topographic.json',
];

function checkStyleLayers(entries, root) {
  const errors = [];
  const forecastEntries = entries.filter(x => x.data.forecast.enabled);
  for (const name of STYLE_NAMES) {
    const style = JSON.parse(
      fs.readFileSync(rel(root, 'public', name), 'utf8')
    );
    const layers = new Map(style.layers.map(layer => [layer.id, layer]));
    for (const region of REGIONS.map(x => x.toLowerCase())) {
      for (const entry of forecastEntries) {
        const id = entry.data.id;
        const available =
          entry.data.forecast.regions[region.toUpperCase()].available;
        for (const expected of [`${id}_${region}`, `${id}_${region}_numbers`]) {
          if (available && !layers.has(expected))
            errors.push(`public/${name}: missing forecast layer ${expected}`);
          else if (!available && layers.has(expected))
            errors.push(
              `public/${name}: unexpected unavailable forecast layer ${expected}`
            );
          else if (
            available &&
            !JSON.stringify(layers.get(expected)).includes(`${id}_score`)
          )
            errors.push(
              `public/${name}: forecast layer ${expected} does not reference ${id}_score`
            );
        }
      }
    }
  }
  return errors;
}

function parseBioclipLabels(root) {
  const text = fs.readFileSync(
    rel(root, 'src', 'data', 'bioclip-labels.ts'),
    'utf8'
  );
  const labels = [
    ...text.matchAll(/\{ scientificName: (['"])(.*?)\1, kind: '([^']+)' \}/g),
  ].map(match => ({ name: match[2], kind: match[3] }));
  const dim = Number(text.match(/BIOCLIP_EMBEDDING_DIM = (\d+)/)?.[1]);
  return { labels, dim };
}

export async function checkRepository(root = process.cwd()) {
  const entries = loadManifests(root);
  const errors = validateManifests(entries, root);
  if (!entries.length) errors.push('content/species: no manifests found');
  let artifacts;
  try {
    artifacts = await buildArtifacts(entries, root);
  } catch (error) {
    errors.push(`generation: ${error.message}`);
    return errors;
  }
  for (const [filename, expected] of artifacts) {
    const absolute = rel(root, filename);
    if (
      !fs.existsSync(absolute) ||
      fs.readFileSync(absolute, 'utf8') !== expected
    )
      errors.push(
        `${filename}: generated artifact is missing or stale; run npm run species:generate`
      );
  }
  errors.push(...checkStyleLayers(entries, root));

  const { labels, dim } = parseBioclipLabels(root);
  const kinds = new Map(labels.map(x => [x.name, x.kind]));
  for (const { data: m } of entries.filter(
    x => x.data.identification.enabled
  )) {
    if (kinds.get(m.identification.label) !== 'catalog')
      errors.push(
        `${m.id}: BioCLIP label ${m.identification.label} is not a shipped catalog row; regenerate the text matrix and run --stage verify-shipped`
      );
  }
  const matrix = rel(root, 'src', 'assets', 'bioclip_text_embeddings.f16.bin');
  if (!Number.isInteger(dim) || !labels.length || !fs.existsSync(matrix))
    errors.push('BioCLIP label/matrix artifacts are missing or unreadable');
  else if (fs.statSync(matrix).size !== labels.length * dim * 2)
    errors.push(
      `BioCLIP label/embedding drift: expected ${labels.length * dim * 2} bytes, found ${fs.statSync(matrix).size}`
    );
  return errors;
}

export async function generate(root = process.cwd()) {
  const entries = loadManifests(root);
  const errors = validateManifests(entries, root);
  if (errors.length) throw new Error(errors.join('\n'));
  for (const [filename, contents] of await buildArtifacts(entries, root)) {
    const absolute = rel(root, filename);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }
  const forecastEntries = entries.filter(x => x.data.forecast.enabled);
  const allForecastIds = forecastEntries.map(x => x.data.id);
  const forecastIdsByRegion = Object.fromEntries(
    REGIONS.map(region => [
      region,
      forecastEntries
        .filter(x => x.data.forecast.regions[region].available)
        .map(x => x.data.id),
    ])
  );
  for (const name of STYLE_NAMES) {
    const filename = rel(root, 'public', name);
    const current = JSON.parse(fs.readFileSync(filename, 'utf8'));
    const updated = reconcileStyleLayers(
      current,
      forecastIdsByRegion,
      allForecastIds
    );
    if (JSON.stringify(current) !== JSON.stringify(updated))
      fs.writeFileSync(
        filename,
        await prettier.format(json(updated), {
          ...PRETTIER_OPTIONS,
          parser: 'json',
        })
      );
  }
}

export function scaffold(id, root = process.cwd(), { forecast = false } = {}) {
  if (!ID_RE.test(id || ''))
    throw new Error('--id must use lowercase kebab/snake case');
  const directory = rel(root, 'content', 'species', id);
  const filename = rel(directory, 'species.json');
  if (fs.existsSync(filename))
    throw new Error(`${path.relative(root, filename)} already exists`);
  const locales = Object.fromEntries(
    LOCALES.map(locale => [
      locale,
      { name: 'TODO', description: 'TODO', howTo: 'TODO' },
    ])
  );
  const regions = forecast
    ? Object.fromEntries(
        REGIONS.map(region => [
          region,
          {
            available: false,
          },
        ])
      )
    : undefined;
  const existingOrders = loadManifests(root).map(
    entry => entry.data.catalog?.order ?? -1
  );
  const manifest = {
    $schema: '../_schema.json',
    schemaVersion: 1,
    id,
    scientificName: 'TODO',
    catalog: {
      enabled: true,
      order: Math.max(-1, ...existingOrders) + 1,
      translationKey: id,
      category: 'mushroom',
      emoji: '🍄',
      season: 'TODO',
      habitat: 'TODO',
      image: {
        path: `src/assets/species/${id}.webp`,
        source: 'TODO',
        author: 'TODO',
        license: 'TODO',
      },
    },
    locales,
    identification: {
      enabled: false,
      label: 'TODO',
      rank: 'species',
      safetyReview: { status: 'pending', references: [] },
    },
    forecast: {
      enabled: forecast,
      dataColumns: [],
      ...(forecast
        ? {
            empiricalSeason: {
              enabled: false,
              taxonKeys: [],
              references: [],
            },
          }
        : {}),
      ...(regions ? { regions } : {}),
    },
  };
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(filename, json(manifest));
  return filename;
}

function usage() {
  console.log(
    'Usage: species-manifest.mjs <scaffold|generate|check> [--id ID] [--forecast]'
  );
}

function requireRequestedManifest(root) {
  const i = process.argv.indexOf('--id');
  if (i < 0) return;
  const id = process.argv[i + 1];
  if (!ID_RE.test(id || '')) throw new Error('--id must name a valid species');
  if (!loadManifests(root).some(entry => entry.data.id === id))
    throw new Error(`content/species/${id}/species.json does not exist`);
}

const invoked =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const [command] = process.argv.slice(2);
  try {
    if (command === 'generate') {
      requireRequestedManifest(process.cwd());
      await generate();
      console.log('Species artifacts generated.');
    } else if (command === 'check') {
      requireRequestedManifest(process.cwd());
      const errors = await checkRepository();
      if (errors.length) {
        console.error(errors.map(x => `- ${x}`).join('\n'));
        process.exitCode = 1;
      } else
        console.log(
          'Species manifests and generated artifacts are complete and in sync.'
        );
    } else if (command === 'scaffold') {
      const i = process.argv.indexOf('--id');
      const filename = scaffold(
        i >= 0 ? process.argv[i + 1] : '',
        process.cwd(),
        { forecast: process.argv.includes('--forecast') }
      );
      console.log(
        `Created ${path.relative(process.cwd(), filename)}. Complete its TODOs and add the WebP image.`
      );
    } else {
      usage();
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
