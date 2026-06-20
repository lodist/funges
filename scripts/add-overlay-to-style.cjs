#!/usr/bin/env node
// Appends the species-score overlay (source + 168 layers) to funges_style.json.
// Source of truth = the live Mapbox style's overlay layers; we keep the exact layer IDs
// the app keys off (<species>_<region>, <species>_<region>_numbers) and only rewrite:
//   source        composite        -> overlay-<region>  (a pmtiles source on R2)
//   source-layer  <region>-scores  -> <region>_scores   (tippecanoe/pmtiles uses underscore)
//   text-font     Sniglet Regular  -> Noto Sans Medium  (Protomaps glyphs only serve Noto Sans)
// Re-run after changing the live style; idempotent (strips any prior overlay first).
//
// Usage: node scripts/add-overlay-to-style.cjs <live_style.json> [funges_style.json]
const fs = require('fs');

const livePath = process.argv[2];
const stylePath = process.argv[3] || 'funges_style.json';
if (!livePath) { console.error('need <live_style.json>'); process.exit(1); }

const R2 = 'https://pub-9988c4492e7945f0a2ff14e35232acdf.r2.dev';
// current source-layer in live style -> [new source id, new pmtiles url, new source-layer]
const REGION = {
  'ne-scores':  ['overlay-ne',  `${R2}/EU/NE/ne_mushroom_data.pmtiles`,   'ne_scores'],
  'se-scores':  ['overlay-se',  `${R2}/EU/SE/se_mushroom_data.pmtiles`,   'se_scores'],
  'use-scores': ['overlay-use', `${R2}/USA/USE/use_mushroom_data.pmtiles`, 'use_scores'],
  'usw-scores': ['overlay-usw', `${R2}/USA/USW/usw_mushroom_data.pmtiles`, 'usw_scores'],
};

const live = JSON.parse(fs.readFileSync(livePath, 'utf8'));
const style = JSON.parse(fs.readFileSync(stylePath, 'utf8'));

// add pmtiles sources
for (const [src, url] of Object.values(REGION).map(([s, u]) => [s, u])) {
  style.sources[src] = { type: 'vector', url: `pmtiles://${url}` };
}

// strip any previously-appended overlay layers (idempotent re-run)
const overlaySources = new Set(Object.values(REGION).map(([s]) => s));
style.layers = style.layers.filter(l => !overlaySources.has(l.source));

const overlay = [];
for (const l of live.layers) {
  const map = REGION[l['source-layer']];
  if (!map) continue; // not a species overlay layer (skips basemap + 'landcover dark'/'water dark')
  const [src, , srcLayer] = map;
  const copy = JSON.parse(JSON.stringify(l));
  copy.source = src;
  copy['source-layer'] = srcLayer;
  delete copy.metadata; // mapbox:group ids, meaningless off-Mapbox
  if (copy.layout && copy.layout['text-font']) copy.layout['text-font'] = ['Noto Sans Medium'];
  overlay.push(copy);
}

// Insert overlay below the basemap labels (first symbol layer) so place names stay on top.
const at = style.layers.findIndex(l => l.type === 'symbol');
style.layers.splice(at === -1 ? style.layers.length : at, 0, ...overlay);

fs.writeFileSync(stylePath, JSON.stringify(style, null, 2) + '\n');
console.log(`inserted ${overlay.length} overlay layers below basemap labels, ${overlaySources.size} sources -> ${stylePath}`);
console.log(`layer total now ${style.layers.length}`);
