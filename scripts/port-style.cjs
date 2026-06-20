/**
 * Ports the AWS-schema Funges style to free Protomaps tiles.
 *
 * Usage:
 *   node scripts/port-style.cjs <input.json> <output.json>
 *   node scripts/port-style.cjs funges_mapstyle_V1.json funges_style_free.json
 *
 * After running, open the output in https://maputnik.github.io and fill in the
 * three URLs marked FILL_ME (from your Protomaps API key or self-hosted pmtiles).
 */
const fs = require('fs');

const IN = process.argv[2] || 'funges_mapstyle_V1.json';
const OUT = process.argv[3] || 'funges_style_free.json';

const s = JSON.parse(fs.readFileSync(IN, 'utf8'));

// --- 1. Repoint the data source. Keep the id "aws" so no layer needs editing.
//     Protomaps source-layers (roads/water/landuse/places/boundaries/earth) match your filters.
s.sources = {
  aws: {
    type: 'vector',
    // Protomaps API:  https://api.protomaps.com/tiles/v4.json?key=YOUR_KEY
    // or self-hosted:  pmtiles://https://your-r2-domain/basemap.pmtiles
    url: 'FILL_ME_TILEJSON_OR_PMTILES_URL',
  },
};

// --- 2. Glyphs + sprite (free). Replace AWS-hosted with your provider's.
s.glyphs = 'FILL_ME_GLYPHS_URL/{fontstack}/{range}.pbf';
s.sprite = 'FILL_ME_SPRITE_URL'; // omit entirely if you drop all icon layers

// --- 3 & 4. Drop layers that don't carry over to the open schema.
const before = s.layers.length;
s.layers = s.layers.filter((l) => {
  if (l.id === 'satellite') return false;            // dropping satellite (vector-only)
  if (l['source-layer'] === 'pois') return false;    // filter on pds_category (HERE-only)
  if (l.id.startsWith('shield_')) return false;      // icons are AWS sprites
  return true;
});

// --- Font swap: "Amazon Ember ... , Noto Sans X" -> just "Noto Sans X"
const fontFor = (str) =>
  /Bold/.test(str) ? 'Noto Sans Bold'
  : /Medium/.test(str) ? 'Noto Sans Medium'
  : 'Noto Sans Regular';

for (const l of s.layers) {
  const tf = l.layout && l.layout['text-font'];
  if (Array.isArray(tf)) {
    l.layout['text-font'] = tf.map((f) =>
      typeof f === 'string' && /Amazon Ember|Noto Sans/.test(f) ? fontFor(f) : f
    );
  }
}

// Drop the now-unused raster imagery source if present.
if (s.sources.awsImagery) delete s.sources.awsImagery;

fs.writeFileSync(OUT, JSON.stringify(s, null, 2));
console.log(`Wrote ${OUT}: kept ${s.layers.length}/${before} layers (dropped ${before - s.layers.length}).`);
console.log('Now fill the FILL_ME urls and open it in maputnik.github.io');
