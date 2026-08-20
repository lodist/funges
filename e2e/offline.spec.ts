import { test, expect } from '@playwright/test';

test('does not offer incomplete packages', async ({ page }) => {
  await page.goto('/offline');

  await expect(
    page.getByRole('heading', { name: 'Offline Maps' })
  ).toBeVisible();
  await expect(page.getByText(/complete regional package/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Offline Maps' })).toHaveCount(0);
  await expect(
    page.getByText(/no complete offline map packages/i)
  ).toBeVisible();
});

test('downloads, validates, activates, and removes a package', async ({
  page,
}) => {
  const basemapUrl = 'https://offline.test/basemap.pmtiles';
  const forecastUrl = 'https://offline.test/forecast.pmtiles';
  await page.route('**/offline-packages.json', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 2,
        generatedAt: '2026-08-20T00:00:00Z',
        packages: [
          {
            id: 'test-package',
            continent: 'eu',
            name: 'Test package',
            description: 'A tiny test package',
            bounds: [5, 45, 11, 48],
            minZoom: 3,
            maxZoom: 12,
            version: 'test-v1',
            updatedAt: '2026-08-20T00:00:00Z',
            published: true,
            resources: [
              {
                id: 'basemap',
                kind: 'basemap',
                sourceUrl: 'https://data.fung.es/basemap/world.pmtiles',
                downloadUrl: basemapUrl,
                sizeBytes: 8,
              },
              {
                id: 'forecast',
                kind: 'forecast',
                sourceUrl: forecastUrl,
                sizeBytes: 8,
              },
            ],
          },
        ],
      }),
    })
  );
  await page.route(
    /https:\/\/offline\.test\/(?:basemap|forecast)\.pmtiles/,
    route =>
      route.fulfill({
        contentType: 'application/octet-stream',
        headers: { 'Content-Length': '8' },
        body: Buffer.from([0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73, 0x03]),
      })
  );

  await page.goto('/offline');
  await page.getByRole('button', { name: 'Download' }).click();

  await expect(page.getByText(/version test-v1/i)).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
});

// Dispatch first so Vite's development websocket cannot replace the page with
// its reconnect shell before React handles the state transition. The production
// suite separately exercises a real offline network and cold reload.
test('map explains itself when the device goes offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  const dismissOnboarding = page.getByRole('button', {
    name: 'Start exploring',
  });
  if (await dismissOnboarding.isVisible()) await dismissOnboarding.click();
  await expect(
    page.getByRole('button', { name: 'Identify from a photo' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Nearby Recipes' })
  ).toBeVisible();
  await expect(page.getByAltText('Loading...')).toBeHidden({ timeout: 60_000 });

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
    window.dispatchEvent(new Event('offline'));
  });

  await expect(page.getByText(/you're offline/i)).toBeVisible();
  await expect(
    page.getByText(/no complete offline map package covers this area/i)
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Identify from a photo' })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Nearby Recipes' })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Get My Location' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Map theme' })).toBeVisible();
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
});

// Cold start in airplane mode is not covered here: `npm run dev` serves an
// empty precache, so an offline reload fails with ERR_INTERNET_DISCONNECTED
// before the app boots. Verify that path against `npm run build && npm run
// preview`, where the service worker has the real precache.
