#!/usr/bin/env node
// Appends a forecast source + hidden forecast fill layer per existing species overlay
// layer, derived from the already-built style (no live-style input needed). Idempotent:
// strips prior `*_fc` layers / `forecast-*` sources first. The app sets each forecast
// layer's active day via setPaintProperty; here the placeholder is `_d1`.
// Usage: node scripts/add-forecast-layers.cjs [public/funges_style.json ...]
const fs = require('fs');

const R2 = 'https://pub-9988c4492e7945f0a2ff14e35232acdf.r2.dev';
// overlay source id -> [forecast source id, forecast pmtiles url, forecast source-layer]
const FC = {
  'overlay-ne':  ['forecast-ne',  `${R2}/EU/NE/ne_forecast.pmtiles`,   'ne_forecast'],
  'overlay-se':  ['forecast-se',  `${R2}/EU/SE/se_forecast.pmtiles`,   'se_forecast'],
  'overlay-use': ['forecast-use', `${R2}/USA/USE/use_forecast.pmtiles`, 'use_forecast'],
  'overlay-usw': ['forecast-usw', `${R2}/USA/USW/usw_forecast.pmtiles`, 'usw_forecast'],
};

function setGetDay(node) {
  // Deep-replace ["get","<x>_score"] -> ["get","<x>_score_d1"] (placeholder day).
  if (Array.isArray(node)) {
    if (node[0] === 'get' && typeof node[1] === 'string' && /_score$/.test(node[1])) {
      return ['get', `${node[1]}_d1`];
    }
    return node.map(setGetDay);
  }
  if (node !== null && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = setGetDay(v);
    return out;
  }
  return node;
}

for (const path of process.argv.slice(2)) {
  const style = JSON.parse(fs.readFileSync(path, 'utf8'));
  // strip prior forecast layers + sources (idempotent)
  style.layers = style.layers.filter(l => !String(l.id).endsWith('_fc'));
  for (const id of Object.keys(style.sources)) if (id.startsWith('forecast-')) delete style.sources[id];

  for (const [src, [fcSrc, url, fcLayer]] of Object.entries(FC)) {
    style.sources[fcSrc] = { type: 'vector', url: `pmtiles://${url}` };
  }

  const fcLayers = [];
  for (const l of style.layers) {
    const fc = FC[l.source];
    if (!fc || l.type !== 'fill') continue;          // only species fill overlays
    const [fcSrc, , fcLayer] = fc;
    const copy = JSON.parse(JSON.stringify(l));
    copy.id = `${l.id}_fc`;
    copy.source = fcSrc;
    copy['source-layer'] = fcLayer;
    copy.paint = setGetDay(copy.paint);
    copy.layout = { ...(copy.layout || {}), visibility: 'none' };
    fcLayers.push(copy);
  }
  style.layers.push(...fcLayers);                    // on top of today layers
  fs.writeFileSync(path, JSON.stringify(style, null, 2) + '\n');
  console.log(`${path}: +${fcLayers.length} forecast layers, ${Object.keys(FC).length} sources`);
}
