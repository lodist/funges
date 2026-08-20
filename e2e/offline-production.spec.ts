import { expect, test } from '@playwright/test';

async function waitForServiceWorker(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>(resolve => {
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => resolve(),
        { once: true }
      );
    });
  });
}

test('production app shell reloads and switches every map style offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await waitForServiceWorker(page);
  const dismissOnboarding = page.getByRole('button', {
    name: 'Start exploring',
  });
  if (await dismissOnboarding.isVisible()) await dismissOnboarding.click();
  await page.reload();
  await expect(page.locator('#app-splash')).toBeHidden();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await context.grantPermissions(['geolocation'], {
    origin: 'http://127.0.0.1:4173',
  });
  await context.setGeolocation({ longitude: 10.68, latitude: 59.2 });

  await context.setOffline(true);
  await expect(page.getByText(/you're offline/i)).toBeVisible();

  const themes = [
    'Dark Low-light palette, easy on the eyes at night.',
    'White Clean, minimal palette with low distraction.',
    'Dark Matter Deep monochrome basemap for maximum contrast.',
    'Topographic Warm hiking-map style with visible trails and tracks.',
    'Light The classic bright Funges map.',
  ];
  for (const theme of themes) {
    await page.getByRole('button', { name: 'Map theme' }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  }

  await page.reload();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Identify from a photo' })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Nearby Recipes' })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Get My Location' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Get My Location' }).click();
  await expect(page.locator('.user-location-marker')).toBeVisible();

  await page.goto('/instructions');
  await expect(
    page.getByText('Using the map offline', { exact: true })
  ).toBeVisible();
});
