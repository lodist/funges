import { Protocol } from 'pmtiles';

// Shared across AdvancedMap and offlineCache: PMTiles instances registered
// here (e.g. from a downloaded offline region) are what MapLibre's
// pmtiles:// resolver finds before falling back to a network fetch.
//
// Deliberately does NOT import maplibre-gl (AdvancedMap registers this with
// maplibregl.addProtocol itself) — most pages don't render the map, and
// pulling maplibre-gl into every page's bundle blew the PWA precache budget.
export const protocol = new Protocol();
