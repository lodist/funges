import { test, expect } from '@playwright/test';

// Sidebar links rendered via Radix Slot+TanStack Link — target by href directly
const sidebarLink = (page: import('@playwright/test').Page, href: string) =>
  page.locator(`[data-slot="sidebar"] a[href="${href}"]`);

// The map page opens a species-selector dialog that blocks pointer events.
// The dialog prevents closing via outside clicks, so we force-click the link
// directly, bypassing the overlay interception.
const clickSidebarLink = async (
  page: import('@playwright/test').Page,
  href: string
) => sidebarLink(page, href).click({ force: true });

test.describe('app navigation', () => {
  test('loads the home page and shows the app name', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/fung\.es/i);
  });

  test('sidebar is visible on desktop', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-slot="sidebar"]')).toBeVisible();
    // The wordmark is an image inside the home link; its accessible name is
    // the only "Funges" text on the page.
    await expect(page.getByRole('link', { name: 'Funges' })).toBeVisible();
  });

  test('navigates to the Species page', async ({ page }) => {
    // Start from a static page: the recommendations page reflows while its
    // data loads, which moved the sidebar under a force-click often enough
    // to make this flaky.
    await page.goto('/instructions');
    await clickSidebarLink(page, '/species');
    await expect(page).toHaveURL(/\/species/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('navigates to the Recipes page', async ({ page }) => {
    await page.goto('/species');
    await clickSidebarLink(page, '/recipes');
    await expect(page).toHaveURL(/\/recipes/);
  });

  test('navigates to the Worth Foraging Now page', async ({ page }) => {
    await page.goto('/species');
    await clickSidebarLink(page, '/worth-foraging-now');
    await expect(page).toHaveURL(/\/worth-foraging-now/);
    await expect(
      page.getByRole('heading', { name: /worth foraging now/i })
    ).toBeVisible();
  });

  test('navigates directly to a page via URL', async ({ page }) => {
    await page.goto('/species');
    await expect(page).toHaveURL(/\/species/);

    await page.goto('/recipes');
    await expect(page).toHaveURL(/\/recipes/);

    await page.goto('/worth-foraging-now');
    await expect(page).toHaveURL(/\/worth-foraging-now/);
  });
});
