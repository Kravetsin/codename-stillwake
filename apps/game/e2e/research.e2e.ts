import { WRECK } from '@stillwake/content';
import { expect, test } from '@playwright/test';
import { gift, send, start, type DevGame } from './dev';

/** The wreck's cell at column `x` and row `y`. */
const at = (x: number, y: number) => y * WRECK[0]!.length + x;
/** The solar panel on the roof, and the analyzer that survived in torn room B. */
const PANEL = at(50, 17);
const ANALYZER = at(41, 21);

test("analyses iron in the wreck's analyzer, cabled to the panel, and sees the iron wall's card appear", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await start(page);
  const menu = page.locator('[data-panel="build"]');
  // The wreck knows its start only: no iron wall in the menu, which listens for B once drawn.
  await expect(page.getByText('[B] Plan')).toBeVisible();
  await page.keyboard.press('KeyB');
  await expect(menu.locator('[data-card="wallScrap"]')).toBeVisible();
  await expect(menu.locator('[data-card="wallIron"]')).toHaveCount(0);
  await page.keyboard.press('KeyB');

  // A cable from the panel to the analyzer, and iron put in it: as a player would, through commands.
  await gift(page, [
    { item: 'iron', count: 1 },
    { item: 'scrap', count: 2 },
  ]);
  await send(page, 'power', 'lay', { a: PANEL, b: ANALYZER });
  const analyzer = await page.evaluate(
    () =>
      (window as unknown as { __game: DevGame }).__game.client.sim.world.slices.grid.machines.find(
        (m) => m.kind === 'analyzer',
      )?.id,
  );
  await send(page, 'items', 'move', { src: { slot: 0 }, dst: { crate: analyzer }, count: 1 });

  // Learned: every peer sees its pictures, and the card is in the menu.
  await expect(page.locator('[data-learned="wallIron"]')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('KeyB');
  await expect(menu.locator('[data-card="wallIron"]')).toBeVisible();
});
