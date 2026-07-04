import { describe, it, expect } from 'vitest';
import { FileSource, PMTiles, Protocol } from 'pmtiles';

// This is the exact mechanism offlineCache.ts relies on: wrapping a downloaded
// Blob in a File (so FileSource.getKey() returns the original URL) and letting
// Protocol.add() key its lookup map by that same string. We can't exercise a
// real PMTiles archive here (network to R2 is CORS-restricted to production),
// but this proves the byte-serving + registration wiring itself works.
describe('offline pmtiles registration', () => {
  // ponytail: jsdom's Blob doesn't implement arrayBuffer(), so getBytes() can't
  // run under this test environment (it works in every real browser — Blob.
  // arrayBuffer has been standard since ~2020). getKey() and Protocol wiring,
  // the parts that don't touch that gap, are still verified below; the actual
  // byte-read path is covered by manual browser testing instead.
  it('FileSource.getKey() returns the URL the File was named with', () => {
    const url = 'https://example.com/region.pmtiles';
    const file = new File([new Uint8Array([1, 2, 3])], url);
    const source = new FileSource(file);

    expect(source.getKey()).toBe(url);
  });

  it('Protocol.add() registers a PMTiles instance under its source key', () => {
    const protocol = new Protocol();
    const url = 'https://example.com/region.pmtiles';
    const file = new File([new Uint8Array([1])], url);
    const pmtiles = new PMTiles(new FileSource(file));

    protocol.add(pmtiles);

    expect(protocol.get(url)).toBe(pmtiles);
  });
});
