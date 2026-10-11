import { HERO, STARTING_CRATE, WRECK } from '@stillwake/content';
import { expect, test } from '@playwright/test';
import { CELL, START_ZOOM } from '../src/render/camera';

/** Where `char` is first drawn on the wreck, in cells. */
function find(char: string): { x: number; y: number } {
  const y = WRECK.findIndex((row) => row.includes(char));
  return { x: WRECK[y]?.indexOf(char) ?? -1, y };
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
