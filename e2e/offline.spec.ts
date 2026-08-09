import { test, expect } from '@playwright/test';

// The map initializes fine without a connection — the style JSON is precached —
// so it renders as empty background with no error. This asserts the user is
// told why, instead of staring at a blank green rectangle.
test('map explains itself when the device goes offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();

  await context.setOffline(true);

  await expect(page.getByText(/you're offline/i)).toBeVisible();
  await expect(page.getByText(/the map needs a connection/i)).toBeVisible();
});

// Cold start in airplane mode is not covered here: `npm run dev` serves an
// empty precache, so an offline reload fails with ERR_INTERNET_DISCONNECTED
// before the app boots. Verify that path against `npm run build && npm run
// preview`, where the service worker has the real precache.
