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
