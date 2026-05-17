import { test, expect } from '@playwright/test';

// shadcn Card renders as <div data-slot="card">, not <article>
const cards = (page: import('@playwright/test').Page) =>
  page.locator('[data-slot="card"]');

test.describe('species page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/species');
    // Wait for the page to be fully rendered before each test
    await expect(
      page.getByRole('heading', { name: /species database/i })
    ).toBeVisible();
  });

  test('shows the species list', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /species database/i })
    ).toBeVisible();
    await expect(cards(page).first()).toBeVisible();
    expect(await cards(page).count()).toBeGreaterThan(5);
  });

  test('filters results by search query', async ({ page }) => {
    const input = page.getByPlaceholder(/search/i);
    await input.fill('chanterelle');

    await expect(cards(page).first()).toBeVisible();
    expect(await cards(page).count()).toBeLessThan(5);

    // Clearing the search restores the full list
    await input.clear();
    expect(await cards(page).count()).toBeGreaterThan(5);
  });

  test('filters results by category', async ({ page }) => {
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /mushrooms/i }).click();

    await expect(cards(page).first()).toBeVisible();
    await expect(page.getByText(/mushroom/i).first()).toBeVisible();
  });

  test('shows a no-results message for an unknown query', async ({ page }) => {
    const input = page.getByPlaceholder(/search/i);
    await input.fill('xyznotaspecies');
    await expect(page.getByText(/no species found/i)).toBeVisible();
  });

  test('search query from URL parameter pre-fills the input', async ({
    page,
  }) => {
    await page.goto('/species?q=nettle', { waitUntil: 'domcontentloaded' });
    const input = page.getByPlaceholder(/search/i);
    await expect(input).toHaveValue('nettle');
  });
});
