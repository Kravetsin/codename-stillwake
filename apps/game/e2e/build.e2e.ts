import { expect, test } from '@playwright/test';

test('takes the plan out with B, picks a card, reopens the menu with the right button and puts it away', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => '__game' in window);
  const menu = page.locator('[data-panel="build"]');
  // The menu listens for B once it is drawn, with the plan away.
  await expect(page.getByText('[B] Plan')).toBeVisible();
  await expect(menu).toHaveCount(0);
  await page.keyboard.press('KeyB');
  await expect(menu).toBeVisible();
  // A card shows its cost against the inventory: the hero carries nothing yet.
  await expect(menu.locator('[data-card="floor"] [data-cost="scrap"]')).toContainText('0/1');
  await menu.getByRole('button', { name: 'Air' }).click();
  await expect(menu.locator('[data-card="vent"]')).toBeVisible();
  await menu.locator('[data-card="vent"]').click();
  await expect(menu).toHaveCount(0);
  // Closed with a tool out, its name stays at the bottom; the right button on the world brings the
  // menu back with the tool still out.
  await expect(page.locator('[data-tool="vent"]')).toBeVisible();
  const view = page.viewportSize() ?? { width: 0, height: 0 };
  await page.mouse.click(view.width / 2, view.height / 3, { button: 'right' });
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-card="vent"]')).toBeVisible();
  // Esc puts the plan away, tool and all.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.locator('[data-tool="vent"]')).toHaveCount(0);
});
