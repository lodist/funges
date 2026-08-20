import { test, expect } from '@playwright/test';

test('offline package catalog keeps package cards concise', async ({
  page,
}) => {
  await page.goto('/offline');

  await expect(
    page.getByRole('heading', { name: 'Offline Maps' })
  ).toBeVisible();
  await expect(page.getByText('Europe forecast data')).toBeVisible();
  await expect(page.getByText('United States forecast data')).toBeVisible();
  await expect(page.getByText('12.9 MB')).toBeVisible();
  await expect(page.getByText('9.4 MB')).toBeVisible();
  await expect(
    page.getByText(/save forecasts before your trip/i)
  ).toBeVisible();
  await expect(page.getByText(/forecast data only/i)).toHaveCount(0);
  await expect(page.getByText(/zoom 3/i)).toHaveCount(0);
});

test('downloads, validates, activates, and removes a package', async ({
  page,
}) => {
  const sourceUrl = 'https://offline.test/tiny.pmtiles';
  await page.route('**/offline-packages.json', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 1,
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
                id: 'forecast',
                kind: 'forecast',
                sourceUrl,
                sizeBytes: 8,
              },
            ],
          },
        ],
      }),
    })
  );
  await page.route(sourceUrl, route =>
    route.fulfill({
      contentType: 'application/octet-stream',
      headers: { 'Content-Length': '8' },
      body: Buffer.from([0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73, 0x03]),
    })
  );

  await page.goto('/offline');
  await page.getByRole('button', { name: 'Download' }).click();

  await expect(page.getByText(/version test-v1/i)).toBeVisible();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
});

// The map initializes fine without a connection — the style JSON is precached —
// so it renders as empty background with no error. This asserts the user is
// told why, instead of staring at a blank green rectangle.
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

  await context.setOffline(true);

  await expect(page.getByText(/you're offline/i)).toBeVisible();
  await expect(
    page.getByText(/no downloaded map package covers this area/i)
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
});

// Cold start in airplane mode is not covered here: `npm run dev` serves an
// empty precache, so an offline reload fails with ERR_INTERNET_DISCONNECTED
// before the app boots. Verify that path against `npm run build && npm run
// preview`, where the service worker has the real precache.
