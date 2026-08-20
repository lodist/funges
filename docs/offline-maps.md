# Offline map packages

Offline maps are controlled by `VITE_OFFLINE_MAPS_ENABLED`. Development builds
show the feature automatically; production builds require the flag to be
exactly `true`.

## Package release

1. Download the canonical world PMTiles archive locally.
2. Install the official `pmtiles` CLI.
3. Build and verify the pilot extracts:

   ```powershell
   python scripts/build_offline_packages.py `
     --world C:\maps\world_z12_20260619.pmtiles `
     --version 2026-08-20 `
     --output-dir dist-offline
   ```

4. Upload every generated archive to the immutable URL emitted in
   `public/offline-packages.json`.
5. Check the remote `Content-Length`, CORS, range support, and checksum.
6. Deploy the manifest only after every referenced archive is available.
7. Enable `VITE_OFFLINE_MAPS_ENABLED=true` first in staging, then production.

The build script never uploads or deploys files. Updating the manifest before
the archives exist would expose downloads that cannot complete.

The scheduled data workflow runs `scripts/refresh_offline_manifest.py`. It
updates forecast sizes, ETags, and resource versions without changing the
basemap resource version, so clients download only changed forecast archives.

## Client lifecycle

Packages stream into OPFS when available, with IndexedDB Blob storage as a
fallback. IndexedDB stores the active package metadata. A new version becomes
active only after all resources pass size and PMTiles-header validation; failed
updates leave the prior version intact. Basemap archives are registered under
the canonical world source URL, while forecast archives retain their style
source URLs.

The service worker deliberately leaves `.pmtiles` requests as `NetworkOnly`.
Complete archives are application-managed because browser caches do not safely
store the range-response pattern used by PMTiles.

## Offline behavior

- Downloaded forecasts, species selection, the forecast slider, zone details,
  all five map styles, and device geolocation remain available.
- Geolocation uses GPS and does not require mobile data, although the first fix
  can be slower and still requires operating-system permission.
- Photo ID, Route to Dish, Google Maps navigation, and Area Data are hidden
  while offline. Open panels close when the browser loses connectivity.
- A forecast-only package does not contain a detailed basemap. The style still
  loads, but only a package containing a `basemap` resource can render detailed
  roads, labels, and terrain offline.

## Testing

`npm run dev` is useful for responsive layout but is not proof that a cold
offline restart works. Run the production service-worker test instead:

```powershell
npm run test:e2e:offline
```

For a manual desktop test, build with `VITE_OFFLINE_MAPS_ENABLED=true`, serve the
production build, download a package, and open the map. Then use browser DevTools
to set Network to Offline, reload, and switch through every map style.

For the final phone test, use an HTTPS deployment, install the PWA, download the
package, open the map once, enable airplane mode, fully close the app, and reopen
it. Confirm the forecast renders, styles switch, Locate Me remains visible, and
network-only controls are absent.
