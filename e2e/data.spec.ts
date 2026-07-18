import { test, expect } from '@playwright/test';

test.describe('data page', () => {
  test('region search param pre-selects the region', async ({ page }) => {
    await page.goto('/data?region=USE', { waitUntil: 'domcontentloaded' });

    const button = page.getByRole('button', { name: 'US East' });
    await expect(button).toHaveClass(/bg-primary/);
  });

  test('with no region param, defaults to North Europe', async ({ page }) => {
    await page.goto('/data', { waitUntil: 'domcontentloaded' });

    const button = page.getByRole('button', { name: 'North Europe' });
    await expect(button).toHaveClass(/bg-primary/);
  });
});
