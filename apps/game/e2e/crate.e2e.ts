import { HERO, STARTING_CRATE, WRECK } from '@stillwake/content';
import { expect, test, type Page } from '@playwright/test';
import { CELL, START_ZOOM } from '../src/render/camera';

/** Where `char` is first drawn on the wreck, in cells. */
function find(char: string): { x: number; y: number } {
  const y = WRECK.findIndex((row) => row.includes(char));
  return { x: WRECK[y]?.indexOf(char) ?? -1, y };
}

/** Drags from one slot to another as a hand does, through every point between: over the world too. */
async function drag(page: Page, from: string, to: string) {
  const a = await page.locator(`[data-slot="${from}"]`).boundingBox();
  const b = await page.locator(`[data-slot="${to}"]`).boundingBox();
  if (!a || !b) throw new Error('no slot');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await page.mouse.up();
}

test('takes a stack from the wreck crate into the hotbar', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => '__game' in window);
  // The camera centres the middle of the hero's body, standing where it wakes.
  const view = page.viewportSize() ?? { width: 0, height: 0 };
  const spawn = find('S');
  const crate = find('K');
  const scale = CELL * START_ZOOM;
  const middle = { x: spawn.x + 0.5, y: spawn.y + 1 - HERO.height / 1000 / 2 };
  await page.mouse.move(
    view.width / 2 + (crate.x + 0.5 - middle.x) * scale,
    view.height / 2 + (crate.y + 0.5 - middle.y) * scale,
  );
  await page.keyboard.press('KeyE');

  const scrap = page.locator('[data-slot="crate-0"]');
  await expect(scrap).toContainText(String(STARTING_CRATE.scrap));
  await scrap.click();
  await page.locator('[data-slot="inv-0"]').click();

  await expect(page.locator('[data-slot="inv-0"]')).toContainText(String(STARTING_CRATE.scrap));
  await expect(scrap).not.toContainText(/\d/);
});

test('drags a stack from the wreck crate into the inventory', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => '__game' in window);
  const view = page.viewportSize() ?? { width: 0, height: 0 };
  const spawn = find('S');
  const crate = find('K');
  const scale = CELL * START_ZOOM;
  const middle = { x: spawn.x + 0.5, y: spawn.y + 1 - HERO.height / 1000 / 2 };
  await page.mouse.move(
    view.width / 2 + (crate.x + 0.5 - middle.x) * scale,
    view.height / 2 + (crate.y + 0.5 - middle.y) * scale,
  );
  await page.keyboard.press('KeyE');

  const steel = page.locator('[data-slot="crate-1"]');
  await expect(steel).toContainText(String(STARTING_CRATE.steel));
  await drag(page, 'crate-1', 'inv-2');

  await expect(page.locator('[data-slot="inv-2"]')).toContainText(String(STARTING_CRATE.steel));
  await expect(steel).not.toContainText(/\d/);

  // Closed, the hotbar still takes a drag from one of its slots to another.
  await page.keyboard.press('Escape');
  await drag(page, 'inv-2', 'inv-5');
  await expect(page.locator('[data-slot="inv-5"]')).toContainText(String(STARTING_CRATE.steel));
  await expect(page.locator('[data-slot="inv-2"]')).not.toContainText(/\d/);
});

test('drops a stack with Q, which the hero picks up again once it may', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => '__game' in window);
  const view = page.viewportSize() ?? { width: 0, height: 0 };
  const spawn = find('S');
  const crate = find('K');
  const scale = CELL * START_ZOOM;
  const middle = { x: spawn.x + 0.5, y: spawn.y + 1 - HERO.height / 1000 / 2 };
  await page.mouse.move(
    view.width / 2 + (crate.x + 0.5 - middle.x) * scale,
    view.height / 2 + (crate.y + 0.5 - middle.y) * scale,
  );
  await page.keyboard.press('KeyE');
  await drag(page, 'crate-1', 'inv-0');
  const slot = page.locator('[data-slot="inv-0"]');
  await expect(slot).toContainText(String(STARTING_CRATE.steel));

  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyQ');
  // Gone from the hand at once; on the floor under the hero, its own for a moment.
  await expect(slot).not.toContainText(/\d/);
  // Thrown ahead of the hero, its own for a moment: walked over after that, it is picked up again.
  await page.waitForTimeout(2500);
  // The hero wakes facing left: the stack flew that way.
  await page.keyboard.down('KeyA');
  await expect(slot).toContainText(String(STARTING_CRATE.steel), { timeout: 10_000 });
  await page.keyboard.up('KeyA');
});
