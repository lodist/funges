# Map migration: Mapbox/AWS → self-hosted MapLibre + PMTiles on R2

**Status:** Style ported & rendering on free Protomaps tiles. App swap + overlay not started.
**Branch:** `feat/maplibre-pmtiles-migration`

---

## 🟢 NEW CONVERSATION — START HERE

**Done so far:**
- Style ported AWS→Protomaps schema and verified rendering (tiles/glyphs/sprite 200, no map errors).
- `funges_style_free.json` — final style, Protomaps tiles+glyphs+sprite wired, Bold→Medium (Protomaps has no Bold). 89 layers. Public Protomaps key `1667c4db9cefcd10` is in the `aws` source url. ✅ loads in Maputnik.
- `funges_mapstyle_V2.json` — the hand-tuned Maputnik export `funges_style_free.json` was generated from.
- `funges_mapstyle_V1.json` — original AWS-schema style (reference).
- `scripts/port-style.cjs` — regenerates the free style from an AWS-schema style (repoints source, Bold/Medium fonts, drops satellite/POI/shield layers).

**Tiles decision still open:** currently using the **Protomaps hosted API** (the key). Cheaper-at-scale alternative is self-hosting an EU+US (or planet) basemap `.pmtiles` on R2 — defer until the API bill matters. See cost section below.

**What's left (do in order):**
1. **Overlay → PMTiles on R2.** In `backend/**/**_MapLayer.py`, after the tippecanoe `.mbtiles` build, `pmtiles convert` and upload `.pmtiles` to R2. Add overlay source + layers to `funges_style_free.json` — **reuse the exact layer IDs the app keys off** (see risk section): `source-layer` = `<region>_scores`.
2. **Renderer swap** `mapbox-gl`→`maplibre-gl` in `src/components/AdvancedMap.tsx` (+ `mapboxgl.Map` type in `src/store/mapStore.ts`), register pmtiles protocol, drop `mapboxgl.accessToken`. See Phase-1 steps below.
3. **Point the app at the new style:** `mapStyle` in `src/store/mapStore.ts` → the R2-hosted `funges_style_free.json` URL (instead of `VITE_MAPBOX_STYLE`).
4. **R2 CORS+Range** for the `.pmtiles` (verify `curl -I -H "Range: bytes=0-99"` → `206`).
5. **Verify** species selector / dark / numbers toggles, click→modal, locate-me, route-to-dish, Google Maps handoff. Remove `VITE_MAPBOX_*`, update `.env.secret.example`.

Key files: `funges_style_free.json`, `funges_mapstyle_V2.json`, `funges_mapstyle_V1.json`, `scripts/port-style.cjs`, `src/components/AdvancedMap.tsx`, `src/store/mapStore.ts`, `backend/**/**_MapLayer.py`, `src/data/species`.
**Goal:** Get off paid map tile providers (Mapbox renderer + AWS Location Service tiles) and onto a fully self-owned, serverless, near-zero-cost stack — without breaking the existing map interactions.

---

## TL;DR decision

Render with **MapLibre GL JS**, serve **everything as static PMTiles + style + glyphs + sprites from Cloudflare R2**. No tile server, no Hetzner, no Mapbox/AWS tile dependency. Vector-only (drop satellite/hybrid imagery).

```
Cloudflare R2 (free egress, ~€1–2/mo flat)
 ├─ basemap.pmtiles     ← Protomaps (OSM-derived, free) — EU + US coverage (or planet)
 ├─ <region>_scores.pmtiles ← our foraging overlay (converted from the .mbtiles we already build)
 ├─ style.json          ← basemap layers (our palette) + overlay layers (correct IDs)
 ├─ glyphs/{fontstack}/{range}.pbf
 └─ sprite.{json,png}
Browser → maplibre-gl + pmtiles plugin → reads all of it from R2
```

---

## Why this architecture (the reasoning, so it isn't re-litigated)

### Two separate things were conflated
- **Renderer** = the JS library drawing the map (`mapbox-gl` today). All interactions live here.
- **Tiles + style** = where map data comes from. This is the only part that talks to a paid provider.

All interactive features are **client-side in the renderer** and survive any tile/provider change:
- Click → feature info: `map.on('click')` + `queryRenderedFeatures` — `src/components/AdvancedMap.tsx`
- Locate me / position: `navigator.geolocation` — `src/store/mapStore.ts`
- Open in Google Maps: just builds a `google.com/maps/dir` URL + `window.open` — `src/components/AdvancedMap.tsx` (`getGoogleMapsDirectionsUrl`)
- Markers, popups, `flyTo`, route animation, layer toggles — all client-side

### A style is welded to its tile schema
A MapLibre style JSON **is** the basemap — its 100+ layers reference specific `source-layer`s (`roads`, `water`, `places`…) and fields (`kind`, `kind_detail`…). You can't drop a style built for one schema onto tiles of another schema; the filters match nothing and the map renders blank.

Our current style (`funges_mapstyle_V1.json`) is built on the AWS Location Service **`kind`/`kind_detail`** schema. That is very close to the **Protomaps basemap schema** — which is why Protomaps is the right open basemap: the palette and most filters port with adaptation, not a full rewrite. (Generic OpenMapTiles uses `class`/`subclass` and would be a near-total rewrite.)

### Cost was the deciding factor (AWS rejected)
AWS Location Service `GetTile` ≈ **$0.40 per 1,000 tiles** (glyphs/sprites/style free; free tier 500k tiles/mo for 3 months only). Our style loads **both vector basemap + raster satellite** ≈ double the tiles. At ~45,000 visitors (`VITE_VISITOR_LIMIT`):

| Usage/session | Monthly tiles @ 45k | Cost/mo (direct) |
|---|---|---|
| Light (~40 tiles) | 1.8M | ~$720 |
| Typical (~120) | 5.4M | ~$2,160 |
| Heavy (~250) | 11.3M | ~$4,500 |

A CDN in front of AWS could cut billed requests ~80–95% → ~$100–400/mo. **PMTiles on R2 ≈ $1–2/mo flat** (R2 has zero egress; cost doesn't scale with traffic). At our scale the open route saves ~$1,000+/mo, which pays back the one-time restyling work almost immediately.
*(Verify the $0.40 rate on the AWS pricing calculator for `eu-west-1` before quoting it anywhere — the docs page wouldn't render the exact figure.)*

### Satellite is the one casualty
There is **no free global high-res satellite source**. Going vector-only drops the `awsImagery` hybrid look. Decision: **drop satellite, go pure vector** — the style already has a full vector basemap underneath, so it won't look bare. (If satellite is ever needed, that one raster layer stays a paid provider; it's the cheap part of AWS.)

---

## ⚠️ Highest-risk item: the layer-ID contract

The app finds layers by **exact string match**. If the new style's overlay layers don't reuse these exact IDs, the species selector / dark toggle / numbers toggle **break silently (no errors)**:

- `id.startsWith(selectedSpecies)` — species code prefix
- `id.includes('_score')`
- `id.endsWith(' dark')`
- `id.includes('numbers')`

Locations: `src/store/mapStore.ts` (`updateVisibleLayers`, `toggleDarkLayersVisibility`, `restoreDarkLayersState`) and `src/components/AdvancedMap.tsx` (click handler, locate-me feature query).

**Action:** when authoring overlay layers, replicate the IDs from the current Mapbox style (`VITE_MAPBOX_STYLE`) exactly. This must be driven by the real style + `src/data/species`, not guessed.

---

## Repo-specific facts to respect

- **Coverage is EU + US**, not Europe-only. Backend builds regions under `backend/EU/*` AND `backend/US/USE`, `backend/US/USW`. A Europe-only basemap would blank out US users. Use EU+US extracts, or planet (only requested byte ranges are served, so planet is cheap on R2).
- **Overlay tiles already exist.** `backend/EU/North_Europe/NE_MapLayer.py` (and siblings) already run tippecanoe → build `.mbtiles` → upload to R2 (`upload_mbtiles_to_r2`, e.g. key `EU/NE/ne_mushroom_data.mbtiles`). The tippecanoe layer name is `f"{region_code}_scores"` (e.g. `ne_scores`) — that's the `source-layer` for the overlay.
- **Embedded AWS key.** The current style hardcodes a `key=v1.public…` in tile/sprite/glyph URLs. If AWS is ever kept for anything, scope that key by HTTP referrer in the AWS console. (Irrelevant once fully migrated.)

---

## Migration plan (incremental)

### Phase 1 — Renderer swap (no visual change yet)
1. `npm rm mapbox-gl && npm i maplibre-gl pmtiles`
2. `src/components/AdvancedMap.tsx`: import `maplibre-gl` + CSS; register the pmtiles protocol once:
   ```ts
   import maplibregl from 'maplibre-gl';
   import 'maplibre-gl/dist/maplibre-gl.css';
   import { Protocol } from 'pmtiles';
   const protocol = new Protocol();
   maplibregl.addProtocol('pmtiles', protocol.tile);
   ```
3. Replace `mapboxgl.*` → `maplibregl.*` (`.Map`, `.Marker`, `.Popup`) and TS types (`GeoJSONFeature`, `MapMouseEvent`, `GeoJSONSource`). Update `mapboxgl.Map` type in `src/store/mapStore.ts`.
4. Remove `mapboxgl.accessToken` line. (MapLibre needs no token.)
5. Everything else (`queryRenderedFeatures`, `on('click'/'move')`, `flyTo`, `setLayoutProperty`, `getStyle().layers`, `addSource`/`addLayer`) is API-identical.

### Phase 2 — Overlay as PMTiles on R2
1. In the MapLayer pipeline, after building `.mbtiles`, convert: `pmtiles convert <in>.mbtiles <out>.pmtiles` (go-pmtiles CLI), upload `.pmtiles` to R2 alongside the existing mbtiles.
2. R2 config: public read (custom domain via Cloudflare preferred) + CORS allowing `GET`/`HEAD`, request header `Range`, expose `Content-Range`/`Content-Length`/`ETag`/`Accept-Ranges`. Verify: `curl -I -H "Range: bytes=0-99" <url>` → `206 Partial Content`.

### Phase 3 — Basemap + style
1. Get a Protomaps basemap PMTiles covering **EU + US** (or planet) onto R2. (Download Protomaps builds, or build extracts with planetiler.)
2. Port the look: start from Protomaps' open base style, apply our palette (gold roads `hsla(43,88%,36%)`, burgundy, teal water `hsla(189,37%,43%)`, cream halos `rgba(245,226,163)`). Palette ≈ easy 80%.
3. POIs (`pds_category`) and highway shields (`shield_text`/`network`) use AWS-specific fields that don't map to Protomaps — rework or drop (the fiddly 20%).
4. Host **glyphs** and **sprite** on R2 (static).
5. Append overlay source + layers, **reusing the exact layer IDs** (see risk section). `source-layer` = `<region>_scores`.
6. Point `mapStyle` in `src/store/mapStore.ts` (currently `import.meta.env.VITE_MAPBOX_STYLE`) at the R2 style URL.

### Phase 4 — Verify & clean up
- Test: species selector, dark toggle, numbers toggle, click→feature modal, locate-me, route-to-dish, Google Maps handoff.
- Remove `VITE_MAPBOX_ACCESS_TOKEN` / `VITE_MAPBOX_STYLE` usage; update `.env.secret.example`.
- Check the visitor-limit fallback path (`MapComponent.tsx` / `MapFallback`) still makes sense.

---

## Styling notes
- Protomaps output is a standard MapLibre style — fully styleable (colors, fonts, sizes, per-zoom visibility, road widths/casings).
- Tools: **Maputnik** (`maputnik.github.io`, visual editor), the **`@protomaps/basemaps`** npm package (themed style generators you recolor in code), or hand-edit JSON.
- Live references for the target look: **maps.protomaps.com**, **openfreemap.org**.

---

## Open questions
- [ ] Basemap scope: EU+US extracts vs. planet PMTiles?
- [ ] Keep highway shields & POI icons (rework for Protomaps schema) or drop them?
- [ ] Custom R2 domain + CDN/cache headers strategy.
- [ ] Confirm AWS `GetTile` rate ($0.40/1,000?) on the pricing calculator — for the record only; we're leaving AWS.

## Key files
- `src/components/AdvancedMap.tsx` — map init, click handler, markers, Google Maps URL, route animation
- `src/store/mapStore.ts` — style URL, layer visibility logic (the ID-match code), geolocation
- `src/components/MapComponent.tsx` / `src/components/MapFallback.tsx` — visitor-limit fallback
- `src/data/species` — species codes that drive layer IDs
- `backend/**/**_MapLayer.py` — tippecanoe → mbtiles → R2 pipeline (add pmtiles convert step)
- `.env.secret.example` — `VITE_MAPBOX_*`, R2 creds
- `funges_mapstyle_V1.json` — the AWS-schema style whose palette we port
