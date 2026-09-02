import { test, expect } from '@playwright/test';

const MOCK_DATASET = {
  updated_at: '2026-05-10T00:00:00Z',
  grid_size_degrees: 0.5,
  min_score: 4,
  regions: {
    NE: [
      { speciesId: 'morel', score: 9.1, lat: 47.6, lng: 7.6 },
      { speciesId: 'nettle', score: 8.4, lat: 47.6, lng: 7.6 },
      { speciesId: 'chant', score: 7.8, lat: 47.6, lng: 7.6 },
    ],
    SE: [],
    USE: [],
    USW: [],
  },
  points: [
    {
      regionId: 'NE',
      lat: 47.6,
      lng: 7.6,
      scores: { morel: 9.1, nettle: 8.4, chant: 7.8 },
    },
  ],
};

test.describe('worth foraging now page', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept the JSON data fetch and return deterministic mock data
    await page.route('**/data/worth_foraging_now.json', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DATASET),
      })
    );
  });

  test('shows the page heading', async ({ page }) => {
    await page.goto('/worth-foraging-now');
    await expect(
      page.getByRole('heading', { name: /worth foraging now/i })
    ).toBeVisible();
  });

  test('shows a loading indicator while data is being fetched', async ({
    page,
  }) => {
    // Delay the response so the loading state is observable
    await page.route('**/data/worth_foraging_now.json', async route => {
      await new Promise(resolve => setTimeout(resolve, 300));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DATASET),
      });
    });

    await page.goto('/worth-foraging-now');
    await expect(page.getByText(/loading/i)).toBeVisible();
  });

  test('renders recommendations after the data loads', async ({ page }) => {
    await page.goto('/worth-foraging-now');
    // Wait for loading to disappear
    await expect(page.getByText(/loading/i)).not.toBeVisible({ timeout: 5000 });
    // At least one recommendation card should be present
    await expect(
      page.getByText(/why this is worth your time/i).first()
    ).toBeVisible();
  });

  test('shows the focus selector and allows switching', async ({ page }) => {
    await page.goto('/worth-foraging-now');
    await expect(page.getByText(/loading/i)).not.toBeVisible({ timeout: 5000 });

    const select = page.getByRole('combobox');
    await expect(select).toBeVisible();

    // Switch to Mushrooms focus
    await select.click();
    await page.getByRole('option', { name: /mushrooms/i }).click();

    // The page should still show recommendations (not crash)
    await expect(
      page.getByRole('heading', { name: /worth foraging now/i })
    ).toBeVisible();
  });

  test('shows an error state when the data fetch fails', async ({ page }) => {
    // Override the beforeEach mock with a failure
    await page.unroute('**/data/worth_foraging_now.json');
    await page.route('**/data/worth_foraging_now.json', route =>
      route.fulfill({ status: 500 })
    );

    await page.goto('/worth-foraging-now');
    await expect(page.getByText(/loading/i)).not.toBeVisible({ timeout: 5000 });
    // Should show either an error message or the no-data message
    const errorOrNoData = page.getByText(/unable to load|no score-based/i);
    await expect(errorOrNoData).toBeVisible();
  });
});
