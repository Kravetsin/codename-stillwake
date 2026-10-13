import { FURNACE, HERO, ITEMS, WRECK } from '@stillwake/content';
import { expect, test, type Page } from '@playwright/test';
import { gift, start, type DevGame } from './dev';
import { CELL, START_ZOOM } from '../src/render/camera';

// Waiting for the first piece of debris alone may take half a minute on a slow CI machine.
test.describe.configure({ timeout: 60_000 });

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

/**
 * Catches the first piece of debris to drift by into the hotbar's first slot, as a hero out in space
 * would: salvage is the only way to anything. Driven through the
 * dev handle, the hero stepped out for the one tick of the grab; its controller brings it back.
 */
async function catchPiece(page: Page) {
  await page.waitForFunction(
    () =>
      (window as unknown as { __game: DevGame }).__game.client.sim.world.slices.debris.pieces
        .length > 0,
    null,
    { timeout: 30_000 },
  );
  await page.evaluate(
    (space) => {
      const game = (window as unknown as { __game: DevGame }).__game;
      const piece = game.client.sim.world.slices.debris.pieces[0];
      if (!piece) throw new Error('no piece');
      game.client.send({ module: 'crew', type: 'enter', payload: { cell: space } });
      game.client.send({ module: 'debris', type: 'grab', payload: { piece: piece.id } });
    },
    10 * WRECK[0]!.length + 10,
  );
  await expect(page.locator('[data-slot="inv-0"]')).toHaveAttribute('data-item', /./);
}

/** Moves the pointer over the middle of cell `at`, as the camera shows it while the hero stands. */
async function pointAt(page: Page, at: { x: number; y: number }) {
  // The camera centres the middle of the hero's body, standing where it wakes.
  const view = page.viewportSize() ?? { width: 0, height: 0 };
  const spawn = find('S');
  const scale = CELL * START_ZOOM;
  const middle = { x: spawn.x + 0.5, y: spawn.y + 1 - HERO.height / 1000 / 2 };
  await page.mouse.move(
    view.width / 2 + (at.x + 0.5 - middle.x) * scale,
    view.height / 2 + (at.y + 0.5 - middle.y) * scale,
  );
}

/** Where a crate is built: on the floor right of where the hero wakes, in reach. */
const CRATE = { x: find('S').x + 1, y: find('S').y };
/** Where a furnace is built: left of where the hero wakes, past the vent, in reach. */
const FURNACE_AT = { x: find('S').x - 2, y: find('S').y - 1 };

/**
 * Builds a machine of `kind` at `at`, as a player would, in creative mode so it costs nothing: its
 * plan sent, then worked with the left button held on it. Opens it with E.
 */
async function build(page: Page, kind: string, at: { x: number; y: number }) {
  await page.evaluate(
    ({ cell, kind }) => {
      const game = (window as unknown as { __game: DevGame }).__game;
      game.client.send({ module: 'items', type: 'setCreative', payload: { on: true } });
      const placement = { layer: 'machine', kind };
      game.client.send({ module: 'building', type: 'placePlan', payload: { cell, placement } });
    },
    { cell: at.y * WRECK[0]!.length + at.x, kind },
  );
  await pointAt(page, at);
  await page.mouse.down();
  await page.waitForFunction(
    (kind) =>
      (window as unknown as { __game: DevGame }).__game.client.sim.world.slices.grid.machines.some(
        (m) => m.kind === kind,
      ),
    kind,
  );
  await page.mouse.up();
  await page.keyboard.press('KeyE');
}

test('puts a caught piece into a crate and takes it back into the hotbar', async ({ page }) => {
  await start(page);
  await catchPiece(page);
  await build(page, 'crate', CRATE);
  await page.locator('[data-slot="inv-0"]').click();
  await page.locator('[data-slot="crate-4"]').click();
  await expect(page.locator('[data-slot="crate-4"]')).toHaveAttribute('data-item', /./);
  await expect(page.locator('[data-slot="inv-0"]')).not.toHaveAttribute('data-item');
  await page.locator('[data-slot="crate-4"]').click();
  await page.locator('[data-slot="inv-1"]').click();
  await expect(page.locator('[data-slot="inv-1"]')).toHaveAttribute('data-item', /./);
});

test('drags a stack into the crate and back, and along the closed hotbar', async ({ page }) => {
  await start(page);
  await catchPiece(page);
  await build(page, 'crate', CRATE);
  await drag(page, 'inv-0', 'crate-2');
  await expect(page.locator('[data-slot="crate-2"]')).toHaveAttribute('data-item', /./);
  await drag(page, 'crate-2', 'inv-2');
  await expect(page.locator('[data-slot="inv-2"]')).toHaveAttribute('data-item', /./);
  await expect(page.locator('[data-slot="crate-2"]')).not.toHaveAttribute('data-item');

  // Closed, the hotbar still takes a drag from one of its slots to another.
  await page.keyboard.press('Escape');
  await drag(page, 'inv-2', 'inv-5');
  await expect(page.locator('[data-slot="inv-5"]')).toHaveAttribute('data-item', /./);
  await expect(page.locator('[data-slot="inv-2"]')).not.toHaveAttribute('data-item');
});

test('builds a furnace, lights it with a plank and smelts a chunk into what it yields', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await start(page);
  await gift(page, [
    { item: 'scrapChunk', count: 1 },
    { item: 'planks', count: 1 },
  ]);
  await build(page, 'furnace', FURNACE_AT);
  // A shift-click sends a plank into its fuel slot, a chunk into its input.
  await page.locator('[data-slot="inv-1"]').click({ modifiers: ['Shift'] });
  await expect(page.locator(`[data-slot="crate-${FURNACE.fuelSlot}"]`)).toHaveAttribute(
    'data-item',
    'planks',
  );
  await page.locator('[data-slot="inv-0"]').click({ modifiers: ['Shift'] });
  // It lights once room A holds air: the plank is burnt, the fire shows.
  await expect(page.locator('[data-fire]')).toHaveAttribute('data-fire', 'lit', {
    timeout: 30_000,
  });
  await expect(page.locator('[data-slot="crate-2"]')).toHaveAttribute('data-item', 'scrap', {
    timeout: (ITEMS.scrapChunk.smeltTicks / 20) * 1000 + 10_000,
  });
  await expect(page.locator('[data-slot="crate-0"]')).not.toHaveAttribute('data-item');
});

test('drops a stack with Q, which the hero picks up again once it may', async ({ page }) => {
  await start(page);
  await catchPiece(page);
  const slot = page.locator('[data-slot="inv-0"]');
  await page.keyboard.press('KeyQ');
  // Gone from the hand at once; thrown ahead of the hero, its own for a moment: walked over after
  // that, it is picked up again.
  await expect(slot).not.toHaveAttribute('data-item');
  await page.waitForTimeout(2500);
  // The hero wakes facing right: the stack flew ahead of it.
  await page.keyboard.down('KeyD');
  await expect(slot).toHaveAttribute('data-item', /./, { timeout: 10_000 });
  await page.keyboard.up('KeyD');
});
