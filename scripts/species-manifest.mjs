#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prettierOptions =
  (await prettier.resolveConfig(
    join(root, 'scripts', 'species-manifest.mjs')
  )) || {};
const contentRoot = join(root, 'content', 'species');
const locales = ['en', 'it', 'fr', 'de', 'es', 'pt'];
const regions = ['NE', 'SE', 'USE', 'USW'];
const styleFiles = [
  'funges_style.json',
  'funges_style_dark.json',
  'funges_style_positron.json',
  'funges_style_darkmatter.json',
  'funges_style_topographic.json',
];
const command = process.argv[2];

function fail(message) {
  throw new Error(message);
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, stable(value[key])])
    );
  return value;
}
function json(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}
function webpDimensions(path) {
  const data = readFileSync(path);
  if (
    data.toString('ascii', 0, 4) !== 'RIFF' ||
    data.toString('ascii', 8, 12) !== 'WEBP'
  )
    fail(`${path}: invalid WebP`);
  const chunk = data.toString('ascii', 12, 16);
  if (chunk === 'VP8X')
    return [1 + data.readUIntLE(24, 3), 1 + data.readUIntLE(27, 3)];
  if (chunk === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  const marker = data.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
  if (marker >= 0)
    return [
      data.readUInt16LE(marker + 3) & 0x3fff,
      data.readUInt16LE(marker + 5) & 0x3fff,
    ];
  fail(`${path}: unsupported WebP encoding`);
}
function manifests() {
  return readdirSync(contentRoot, { withFileTypes: true })
    .filter(
      entry =>
        entry.isDirectory() &&
        existsSync(join(contentRoot, entry.name, 'species.json'))
    )
    .map(entry =>
      JSON.parse(
        readFileSync(join(contentRoot, entry.name, 'species.json'), 'utf8')
      )
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}
function validate(all) {
  const ids = new Set();
  for (const item of all) {
    const at = `content/species/${item.id || '?'}/species.json`;
    if (!/^[a-z][a-z0-9_]*$/.test(item.id || '')) fail(`${at}: invalid id`);
    if (ids.has(item.id)) fail(`${at}: duplicate id`);
    ids.add(item.id);
    if (!item.scientificName || !item.category || !item.emoji)
      fail(`${at}: missing identity fields`);
    if (JSON.stringify(item).includes('TODO'))
      fail(`${at}: unresolved TODO value`);
    if (
      !['mushroom', 'plant', 'berry', 'nut', 'flower'].includes(item.category)
    )
      fail(`${at}: invalid category`);
    if (!item.catalog || !item.map || !item.scoring || !item.safety)
      fail(`${at}: missing feature contract`);
    for (const locale of locales) {
      const t = item.catalog.translations?.[locale];
      if (item.catalog.enabled && (!t?.name || !t?.description || !t?.howTo))
        fail(`${at}: incomplete ${locale} translation`);
    }
    if (item.map.enabled) {
      if (!item.scoring.enabled)
        fail(`${at}: mapped species must enable scoring`);
      for (const region of regions)
        if (
          !Array.isArray(item.map.landcover?.[region]) ||
          !item.map.landcover[region].length
        )
          fail(`${at}: map.landcover.${region} is required`);
    }
    if (item.scoring.enabled) {
      for (const key of [
        'optimal_temp',
        'temp_sigma',
        'optimal_alt',
        'alt_sigma',
        'optimal_humidity',
        'humidity_sigma',
        'optimal_pH',
        'pH_sigma_near',
        'pH_sigma_far',
        'pH_range_near',
      ])
        if (item.scoring.params?.[key] === undefined)
          fail(`${at}: scoring.params.${key} is required`);
    }
    const image = join(contentRoot, item.id, item.image || '');
    if (
      item.catalog.enabled &&
      (!item.image || !item.image.endsWith('.webp') || !existsSync(image))
    )
      fail(`${at}: catalog image WebP is missing`);
    if (item.catalog.enabled) {
      const [width, height] = webpDimensions(image);
      if (width > 512 || height > 512)
        fail(`${at}: image is ${width}x${height}; maximum is 512x512`);
    }
  }
}
function cloneLayer(layer, speciesId) {
  const text = JSON.stringify(layer)
    .replaceAll('chant_score', `${speciesId}_score`)
    .replaceAll('chant_', `${speciesId}_`);
  const cloned = JSON.parse(text);
  cloned.metadata = {
    ...(cloned.metadata || {}),
    'funges:manifestSpecies': speciesId,
  };
  return cloned;
}
async function outputs(all) {
  const catalog = all
    .filter(x => x.catalog.enabled)
    .map(x => ({
      id: x.id,
      nameKey: `${x.id}.name`,
      scientificName: x.scientificName,
      category: x.category,
      emoji: x.emoji,
      descriptionKey: `${x.id}.description`,
      howToKey: `${x.id}.howTo`,
      season: x.catalog.season,
      habitat: x.catalog.habitat,
      showOnMap: x.map.enabled,
      safety: x.safety,
    }));
  const translations = Object.fromEntries(
    locales.map(locale => [
      locale,
      Object.fromEntries(
        all
          .filter(x => x.catalog.enabled)
          .map(x => [x.id, x.catalog.translations[locale]])
      ),
    ])
  );
  const bioclip = all
    .filter(x => x.bioclip?.enabled !== false)
    .map(x => x.bioclip?.label || x.scientificName);
  const ts = await prettier.format(
    `// GENERATED by scripts/species-manifest.mjs. DO NOT EDIT.\nimport type { Species } from '@/data/species';\nexport const MANIFEST_SPECIES: Species[] = ${JSON.stringify(catalog)};\nexport const MANIFEST_TRANSLATIONS = ${JSON.stringify(translations)} as const;\nexport const MANIFEST_BIOCLIP_LABELS = ${JSON.stringify(bioclip)} as const;\n`,
    { ...prettierOptions, parser: 'typescript' }
  );
  const scoring = Object.fromEntries(
    all
      .filter(x => x.scoring.enabled)
      .map(x => [
        x.id,
        { ...x.scoring.params, scientific_name: x.scientificName },
      ])
  );
  const landcover = Object.fromEntries(
    regions.map(region => [
      region,
      Object.fromEntries(
        all.filter(x => x.map.enabled).map(x => [x.id, x.map.landcover[region]])
      ),
    ])
  );
  const pySet = bioclip.length
    ? `{${bioclip.map(value => JSON.stringify(value)).join(', ')}}`
    : 'set()';
  const py = `# GENERATED by scripts/species-manifest.mjs. DO NOT EDIT.\nSPECIES_PARAMS = ${JSON.stringify(scoring, null, 2).replaceAll('true', 'True').replaceAll('false', 'False').replaceAll('null', 'None')}\nLANDCOVER_BY_REGION = ${JSON.stringify(landcover, null, 2)}\nBIOCLIP_CATALOG_NAMES = ${pySet}\n`;
  const result = new Map([
    [join(root, 'src', 'generated', 'species-manifests.ts'), ts],
    [
      join(root, 'backend', 'src', 'funges_backend', 'generated_species.py'),
      py,
    ],
  ]);
  for (const item of all.filter(x => x.catalog.enabled))
    result.set(
      join(root, 'src', 'assets', 'species', `${item.id}.webp`),
      readFileSync(join(contentRoot, item.id, item.image))
    );
  for (const filename of styleFiles) {
    const path = join(root, 'public', filename);
    const source = readFileSync(path, 'utf8');
    if (!all.some(item => item.map.enabled)) {
      result.set(path, source);
      continue;
    }
    const style = JSON.parse(source);
    style.layers = style.layers.filter(
      layer => !layer.metadata?.['funges:manifestSpecies']
    );
    for (const item of all.filter(x => x.map.enabled))
      for (const region of regions.map(x => x.toLowerCase())) {
        for (const suffix of ['', '_numbers']) {
          const index = style.layers.findIndex(
            layer => layer.id === `chant_${region}${suffix}`
          );
          if (index < 0) fail(`${filename}: missing chant template`);
          style.layers.splice(
            index + 1,
            0,
            cloneLayer(style.layers[index], item.id)
          );
        }
      }
    result.set(
      path,
      await prettier.format(JSON.stringify(style), {
        ...prettierOptions,
        parser: 'json',
        filepath: path,
      })
    );
  }
  return result;
}
async function writeOrCheck(all, check) {
  validate(all);
  const generated = await outputs(all);
  const drift = [];
  for (const [path, value] of generated) {
    const current = existsSync(path) ? readFileSync(path) : null;
    const wanted = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (!current?.equals(wanted)) {
      if (check) drift.push(relative(root, path));
      else {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, wanted);
      }
    }
  }
  if (drift.length) fail(`generated files are stale:\n${drift.join('\n')}`);
  console.log(
    `${check ? 'checked' : 'generated'} ${all.length} species manifest(s)`
  );
}
function scaffold(id) {
  if (!/^[a-z][a-z0-9_]*$/.test(id || ''))
    fail('usage: npm run species:scaffold -- <snake_case_id>');
  const dir = join(contentRoot, id);
  const path = join(dir, 'species.json');
  if (existsSync(path)) fail(`${path} already exists`);
  mkdirSync(dir, { recursive: true });
  const translations = Object.fromEntries(
    locales.map(locale => [
      locale,
      {
        name: `TODO (${locale})`,
        description: `TODO (${locale})`,
        howTo: `TODO (${locale})`,
      },
    ])
  );
  writeFileSync(
    path,
    json({
      id,
      scientificName: 'TODO',
      category: 'mushroom',
      emoji: '🍄',
      catalog: { enabled: true, season: 'TODO', habitat: 'TODO', translations },
      map: { enabled: false, landcover: {} },
      scoring: { enabled: false, params: {} },
      safety: {
        edibility: 'unknown',
        warning: 'Never consume based only on this app.',
      },
      image: `${id}.webp`,
      bioclip: { enabled: true, label: 'TODO' },
    })
  );
  console.log(
    `created ${relative(root, path)}; add ${id}.webp, complete TODOs, then run species:generate`
  );
}

try {
  if (command === 'scaffold') scaffold(process.argv[3]);
  else if (command === 'generate') await writeOrCheck(manifests(), false);
  else if (command === 'check') await writeOrCheck(manifests(), true);
  else fail('usage: species-manifest.mjs <scaffold|generate|check>');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
