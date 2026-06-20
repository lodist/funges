# Map migration: Mapbox/AWS → self-hosted MapLibre + PMTiles on R2

**Status:** Steps 1–5 effectively DONE and verified locally — overlay→PMTiles, renderer swap, self-hosted style, R2 CORS+Range, dark mode, label ordering. Map renders end-to-end on `npm run dev` (all 4 region `.pmtiles` live on R2). Remaining: install `pmtiles` CLI on the MapLayer host (DONE in WSL), merge to main, and (deferred) Phase A below when traffic nears the Protomaps free-tier cap.
**Branch:** `feat/maplibre-pmtiles-migration`

## ⚡ SESSION UPDATE (read this first — supersedes stale lines below)
- **Files renamed:** `funges_style_free.json` → **`funges_style.json`** (root + `public/`), and **`funges_style_dark.json`** added (both 257 layers = 89 basemap + 168 overlay). `mapStyle` constants `LIGHT_STYLE`/`DARK_STYLE` in `mapStore.ts`.
- **Dark mode = full style swap** (Protomaps has no per-layer ` dark`). The dark button flips `mapStyle` between the two URLs; AdvancedMap's `[mapStyle]` effect reloads the map (camera preserved). `restoreDarkLayersState` is now a no-op. Both styles carry the overlay.
- **Labels render above the overlay** — `add-overlay-to-style.cjs` now inserts overlay layers *before* the first basemap symbol layer (was appending at end).
- **getStyle() guarded** during style swap (`getStyle()?.layers`) in `mapStore.ts` + `AdvancedMap.tsx` — fixed "Cannot read properties of undefined (reading 'layers')" on dark toggle.
- **`pmtiles` CLI installed in WSL** (`/usr/local/bin/pmtiles`, v1.30.3) — the MapLayer pipeline will now actually convert+upload `.pmtiles`. ⚠️ It's a silent skip if missing on any rebuilt host (`shutil.which("pmtiles")` → returns False, no error). Consider making it raise.
- **All 4 overlay `.pmtiles` are live on R2** (NE/SE/USE/USW) and range-enabled (`206`). Currently built by hand; the pipeline reproduces them once it runs with pmtiles on PATH.
- **Free-tier capacity:** Protomaps hosted API = **1M basemap tile req/mo (soft cap, non-commercial)**. Only basemap counts (overlay/glyphs/sprite are on R2/GitHub). ≈ **8k typical sessions/mo** (4k heavy – 25k light). At the 45k `VITE_VISITOR_LIMIT` you'd exceed it ~5× → do Phase A.

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
1. ✅ **DONE — Overlay → PMTiles on R2.** All 4 `backend/**/**_MapLayer.py` now `pmtiles convert` the `.mbtiles` and upload the `.pmtiles` alongside it (same R2 key, `.pmtiles` ext): `EU/NE/ne_mushroom_data.pmtiles`, `EU/SE/…`, `USA/USE/…`, `USA/USW/…`. Overlay source + **168 layers** appended to `funges_style_free.json` via `scripts/add-overlay-to-style.cjs` (re-runnable, idempotent). Exact layer IDs preserved (`<species>_<region>`, `<species>_<region>_numbers` — 84 fills + 84 numbers). `source-layer` = `<region>_scores` (underscore — tippecanoe's `-l`; the **live Mapbox style used `<region>-scores` with a hyphen**, that's the Mapbox-tileset name, NOT what our pmtiles emit). 4 vector sources `overlay-{ne,se,use,usw}` → `pmtiles://…r2.dev/…`. **Heads-up before relying on it:**
   - **`pmtiles` CLI (go-pmtiles) must be on PATH** on the host running the MapLayer scripts (same as tippecanoe). If absent, conversion is skipped with a warning — non-fatal, but no `.pmtiles` gets uploaded.
   - **`_numbers` font remapped** `Sniglet Regular`→`Noto Sans Medium` (Protomaps glyphs only serve Noto Sans; the custom font would render blank). Visual-only.
   - **Dark toggle has nothing to toggle yet.** The live style's only ` dark` layers are `landcover dark` / `water dark` (basemap, Mapbox `class` schema) — they were NOT in the ported free style and aren't overlay layers. Reworking them for Protomaps (`landcover`/`water` source-layers) is basemap/Phase-3 work. Until then `toggleDarkLayersVisibility` is a no-op.
   - **12 `showOnMap` species have no layers** (blackberry, blueberry, chicken-of-the-woods, daisy, elderberry, elderflower, hazelnut, oyster-mushroom, plantain, shiitake, violets, wild-mint). **Pre-existing** — identical to the current live Mapbox style (only 21 species have layers). Not a regression; backend `species_forest_mapping` would need them added to ever populate.
2. ✅ **DONE — Renderer swap** `mapbox-gl`→`maplibre-gl`. `npm rm mapbox-gl && npm i maplibre-gl pmtiles`. Swapped across **6 files** (not just 2 — `mapboxgl.*` was an ambient global): `AdvancedMap.tsx` (import+css, `maplibregl.addProtocol('pmtiles', new Protocol().tile)`, dropped `accessToken`, all `mapboxgl.*`→`maplibregl.*`), `mapStore.ts`, `FeatureInfoModal.tsx`, `lib/geo.ts`, `lib/route-to-dish.ts`, `test/geo.test.ts`. Three maplibre API diffs fixed: dropped `performanceMetricsCollection` Map option (not in maplibre), guarded `layer.source` with `'source' in layer` (maplibre's `LayerSpecification` union), `querySourceFeatures` returns `GeoJSONFeature[]` not `MapGeoJSONFeature[]`. `tsc -b` + `vite build` green. (Repo-wide CRLF/prettier lint errors are pre-existing, not from this.)
3. ✅ **DONE — Point the app at the new style.** Style is **self-hosted from `public/funges_style_free.json`** (160KB static, ships with the app — no R2/CORS/custom domain for the style; R2 is only for the `.pmtiles`). `mapStyle` in `src/store/mapStore.ts` = `'/funges_style_free.json'` (relative). `VITE_MAPBOX_STYLE` dropped from `mapStore.ts` + `.env.secret.example`. **⚠️ `public/funges_style_free.json` is a COPY of the root `funges_style_free.json`** — the root is the source (edited in Maputnik / regenerated by `scripts/add-overlay-to-style.cjs`); after regenerating, **re-copy to `public/`**. Glyphs/sprite/basemap tiles still come from Protomaps-hosted URLs inside the style (fine — free). **Map still won't render end-to-end until the overlay `.pmtiles` are on R2** (backend pipeline runs post-merge); the basemap will load before then.
4. **R2 CORS+Range** for the `.pmtiles` (verify `curl -I -H "Range: bytes=0-99"` → `206`).
5. **Verify** species selector / dark / numbers toggles, click→modal, locate-me, route-to-dish, Google Maps handoff. Remove `VITE_MAPBOX_*`, update `.env.secret.example`.

Key files: `funges_style_free.json`, `funges_mapstyle_V2.json`, `funges_mapstyle_V1.json`, `scripts/port-style.cjs`, `scripts/add-overlay-to-style.cjs`, `src/components/AdvancedMap.tsx`, `src/store/mapStore.ts`, `backend/**/**_MapLayer.py`, `src/data/species`.
**Goal:** Get off paid map tile providers (Mapbox renderer + AWS Location Service tiles) and onto a fully self-owned, serverless, near-zero-cost stack — without breaking the existing map interactions.

---

## Phase A — Basemap on R2 (DEFERRED; do when sessions approach ~8k/mo)

Moves the **basemap** off the metered Protomaps API onto R2 (free egress, no per-tile cap). Only the tiles move — **glyphs + sprite stay on `protomaps.github.io/basemaps-assets/…`** (free GitHub Pages static, not the metered API, leave them). The Protomaps *build* pmtiles use the **same `kind`/`kind_detail` schema** as the API, so the style's filters keep working — it's purely a source-URL swap.

1. **Get the basemap pmtiles.** `pmtiles` CLI is already in WSL. Grab the current build name from https://maps.protomaps.com/builds (a dated planet file at `https://build.protomaps.com/<DATE>.pmtiles`). Either:
   - **Planet (simplest, one file, one source):** download or `pmtiles extract` nothing — just use the whole planet. Storage ≈107GB on R2 ≈ **$1.6/mo**; range requests mean transfer stays tiny. Recommended — no bbox math, covers EU+US+everything.
   - **Or EU+US extracts (smaller storage, two sources):**
     ```bash
     pmtiles extract https://build.protomaps.com/<DATE>.pmtiles eu.pmtiles  --bbox=-25,34,45,72
     pmtiles extract https://build.protomaps.com/<DATE>.pmtiles us.pmtiles  --bbox=-125,24,-66,50
     ```
     (Two disjoint regions can't be one bbox without the Atlantic; two files = two `basemap-*` sources + duplicated basemap layers per source. Planet avoids this.)
2. **Upload to R2** (rclone with the `RCLONE_CONFIG_R2_*` env pattern, or dashboard) to e.g. `basemap/planet.pmtiles`. Confirm range: `curl -sI -H "Range: bytes=0-99" https://pub-9988c4492e7945f0a2ff14e35232acdf.r2.dev/basemap/planet.pmtiles` → `206`.
3. **Swap the style source.** In `funges_style.json` AND `funges_style_dark.json` (root + `public/`), change the `aws` source:
   ```json
   "aws": { "type": "vector", "url": "pmtiles://https://pub-9988c4492e7945f0a2ff14e35232acdf.r2.dev/basemap/planet.pmtiles" }
   ```
   (was `https://api.protomaps.com/tiles/v4.json?key=…`). Keep the source id `aws` so no layer changes. Leave `glyphs`/`sprite` pointing at protomaps.github.io. Check the build's `maxzoom` (~15) is fine for the style.
4. **Re-copy root → `public/`**, `npm run dev`, verify basemap still renders (same look, now from R2) + overlay + dark toggle. Then merge.
5. **Freshness:** the planet build is a snapshot — re-pull/re-upload periodically (e.g. quarterly) for updated OSM data. Cheap to automate later.

Result: basemap + overlay + style all on R2 (~€1–2/mo flat), no Protomaps API, no per-tile cap, no commercial-tier concern.

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
