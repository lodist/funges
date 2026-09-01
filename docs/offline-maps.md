# Offline map packages

Offline maps are available in development and production. The package catalog
must reference only complete, publicly accessible packages.

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

4. Upload every generated archive beside the world archive under `basemap/`.
   Regional filenames follow `<region>_z<zoom>_<YYYYMMDD>.pmtiles`, matching
   `world_z12_<YYYYMMDD>.pmtiles` and remaining immutable without dated folders.
5. Check the remote `Content-Length`, CORS, range support, and checksum.
6. Deploy the manifest only after every referenced archive is available.
7. Verify the package in staging, then deploy the updated manifest.

The build script never uploads or deploys files. Updating the manifest before
the archives exist would expose downloads that cannot complete.
It copies the current forecast metadata from `public/offline-packages.json` so
building a new basemap cannot restore old forecast sizes or versions.

The scheduled data workflow runs `scripts/refresh_offline_manifest.py`. It
updates forecast sizes, ETags, and resource versions without changing the
basemap resource version, so clients download only changed forecast archives.

## Client lifecycle

Packages stream into OPFS when available, with IndexedDB Blob storage as a
fallback. IndexedDB stores the active package metadata. Downloads remain valid
for seven days. Refreshing an expired package reuses every independently
versioned resource that is still current, so a stable basemap is not downloaded
again when only forecasts changed.

When the browser has enough free space, a replacement is staged before the old
resource is removed. With a small per-site quota, the updater may first remove
superseded resources after confirming that their reclaimed space is sufficient.
If that in-place replacement then fails, the package is marked unavailable but
retained current resources can still be reused by the next download attempt.
Basemap archives are registered under the canonical world source URL, while
forecast archives retain their style source URLs.

The service worker deliberately leaves `.pmtiles` requests as `NetworkOnly`.
Complete archives are application-managed because browser caches do not safely
store the range-response pattern used by PMTiles.

## Offline behavior

- Downloaded forecasts, species selection, the forecast slider, zone details,
  all five map styles, and device geolocation remain available.
- Geolocation uses GPS and does not require mobile data, although the first fix
  can be slower and still requires operating-system permission.
- Photo ID remains available offline once its one-time model download has
  completed. Route to Dish, Google Maps navigation, and Area Data are hidden
  while offline. Open network-backed panels close when connectivity is lost.
- Every published package contains both a regional basemap and its foraging
  forecasts. Do not publish forecast-only package definitions.
- Cached map resources are activated only while offline. Online sessions use
  the live basemap and live forecasts even when a package is installed.
- Packages become unavailable offline seven days after download. The Offline
  Maps page keeps the files until the user updates or removes them; an update
  reuses unchanged resources and resets the seven-day validity period.

## Testing

`npm run dev` is useful for responsive layout but is not proof that a cold
offline restart works. Run the production service-worker test instead:

```powershell
npm run test:e2e:offline
```

That automated test covers cold app-shell reloads, style switching,
connectivity-dependent controls, instructions, and geolocation on desktop and
mobile Chromium. It deliberately does not download the published 380 MB or
1.3 GB packages, so final basemap and forecast verification remains a manual
release check on a real package.

For a manual desktop test, build and serve the production app, download a
package, and wait until its status changes to Downloaded. Then use browser
DevTools to set Network to Offline, reload, and switch through every map style.

For the final phone test, use an HTTPS deployment, install the PWA, download the
package, and confirm its status is Downloaded. Enable airplane mode, fully close
the app, and reopen it. Confirm the basemap and forecast render, styles switch,
Locate Me remains visible, and network-only controls are absent. Repeat after
returning online to confirm live sources are restored, then update or remove the
package from Offline Maps.
