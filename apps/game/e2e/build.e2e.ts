import { expect, test } from '@playwright/test';

interface DevGame {
  client: { sim: { world: { slices: { building: { plans: readonly object[] } } } } };
}

test('takes the plan out with B, picks a card, reopens the menu with B and puts it away', async ({
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
  // A card's tooltip shows its cost against the inventory: the hero carries nothing yet.
  await menu.locator('[data-card="floor"]').hover();
  await expect(menu.locator('[data-tooltip] [data-cost="scrap"]')).toContainText('0/1');
  await menu.getByRole('button', { name: 'Air' }).click();
  await expect(menu.locator('[data-card="vent"]')).toBeVisible();
  await menu.locator('[data-card="vent"]').click();
  await expect(menu).toHaveCount(0);
  // Closed with a card in hand, the card stays at the bottom; B brings the menu back with it.
  await expect(page.locator('[data-tool="vent"]')).toBeVisible();
  await page.keyboard.press('KeyB');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-card="vent"]')).toBeVisible();
  // Esc puts the plan away, card and all.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.locator('[data-tool="vent"]')).toHaveCount(0);
});

test('picks the card of what is under the pointer with the middle button, and removes with the right', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => '__game' in window);
  await expect(page.getByText('[B] Plan')).toBeVisible();
  // The camera follows the hero: the middle of the screen is inside the ship, a back wall at least.
  const view = page.viewportSize() ?? { width: 0, height: 0 };
  const middle = { x: view.width / 2, y: view.height / 2 };
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.up({ button: 'middle' });
  await expect(page.locator('[data-tool]')).toBeVisible();
  // With the card in hand, a right drag marks what it covers to take apart.
  const marks = () =>
    page.evaluate(
      () =>
        (
          window as unknown as { __game: DevGame }
        ).__game.client.sim.world.slices.building.plans.filter((p) => 'clear' in p).length,
    );
  expect(await marks()).toBe(0);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(middle.x + 4, middle.y);
  await page.mouse.up({ button: 'right' });
  await expect.poll(marks).toBe(1);
});
