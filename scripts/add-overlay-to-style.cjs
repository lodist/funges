#!/usr/bin/env node
// Appends the species-score overlay (source + 168 layers) to public/funges_style.json.
// Source of truth = the live Mapbox style's overlay layers; we keep the exact layer IDs
// the app keys off (<species>_<region>, <species>_<region>_numbers) and only rewrite:
//   source        composite        -> overlay-<region>  (a pmtiles source on R2)
//   source-layer  <region>-scores  -> <region>_forecast (the single forecast tileset,
//                                     which carries today at d0 + the slider's d6 endpoint)
//   text-font     Sniglet Regular  -> Noto Sans Medium  (Protomaps glyphs only serve Noto Sans)
// Re-run after changing the live style; idempotent (strips any prior overlay first).
//
// Usage: node scripts/add-overlay-to-style.cjs <live_style.json> [public/funges_style.json]
const fs = require('fs');

const livePath = process.argv[2];
const stylePath = process.argv[3] || 'public/funges_style.json';
if (!livePath) {
  console.error('need <live_style.json>');
  process.exit(1);
}

const R2 = 'https://data.fung.es';
// current source-layer in live style -> [new source id, new pmtiles url, new source-layer]
const REGION = {
  'ne-scores': ['overlay-ne', `${R2}/EU/NE/ne_forecast.pmtiles`, 'ne_forecast'],
  'se-scores': ['overlay-se', `${R2}/EU/SE/se_forecast.pmtiles`, 'se_forecast'],
  'use-scores': [
    'overlay-use',
    `${R2}/USA/USE/use_forecast.pmtiles`,
    'use_forecast',
  ],
  'usw-scores': [
    'overlay-usw',
    `${R2}/USA/USW/usw_forecast.pmtiles`,
    'usw_forecast',
  ],
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

// Low-zoom legibility. Below ~z7 a forecast cell is sub-pixel (z4: ~9.8 km/px vs a
// ~1 km triangle), and with antialiasing off a sub-pixel fill is all-or-nothing per
// pixel — coverage never accumulates, so the continent reads as pale speckle instead
// of colour. Turn AA on where the cells are smaller than a pixel and push opacity to
// full; both revert at z8, where the cells are large enough that AA would instead
// paint a visible hairline seam between every pair of abutting triangles (the reason
// `fill-antialias: false` is on these layers in the first place).
const LOW_ZOOM_FILL = {
  'fill-antialias': ['step', ['zoom'], true, 8, false],
  'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 1, 8, 0.85],
};

const overlay = [];
for (const l of live.layers) {
  const map = REGION[l['source-layer']];
  if (!map) continue; // not a species overlay layer (skips basemap + 'landcover dark'/'water dark')
  const [src, , srcLayer] = map;
  const copy = JSON.parse(JSON.stringify(l));
  copy.source = src;
  copy['source-layer'] = srcLayer;
  delete copy.metadata; // mapbox:group ids, meaningless off-Mapbox
  if (copy.layout && copy.layout['text-font'])
    copy.layout['text-font'] = ['Noto Sans Medium'];
  if (copy.type === 'fill') Object.assign(copy.paint, LOW_ZOOM_FILL);
  overlay.push(copy);
}

// Insert overlay below the basemap labels (first symbol layer) so place names stay on top.
const at = style.layers.findIndex(l => l.type === 'symbol');
style.layers.splice(at === -1 ? style.layers.length : at, 0, ...overlay);

fs.writeFileSync(stylePath, JSON.stringify(style, null, 2) + '\n');
console.log(
  `inserted ${overlay.length} overlay layers below basemap labels, ${overlaySources.size} sources -> ${stylePath}`
);
console.log(`layer total now ${style.layers.length}`);
