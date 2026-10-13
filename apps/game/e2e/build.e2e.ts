import { expect, test } from '@playwright/test';

test('opens the build menu with B, and picks a tool from a card, which closes it', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => '__game' in window);
  const menu = page.locator('[data-panel="build"]');
  await expect(menu).toHaveCount(0);
  await page.keyboard.press('KeyB');
  await expect(menu).toBeVisible();
  // A card shows its cost against the inventory: the hero carries nothing yet.
  await expect(menu.locator('[data-card="floor"] [data-cost="scrap"]')).toContainText('0/1');
  await menu.getByRole('button', { name: 'Air' }).click();
  await expect(menu.locator('[data-card="vent"]')).toBeVisible();
  await menu.locator('[data-card="vent"]').click();
  await expect(menu).toHaveCount(0);
  // Closed with a tool out, its name stays at the bottom; Esc puts it away.
  await expect(page.locator('[data-tool="vent"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-tool="vent"]')).toHaveCount(0);
});
