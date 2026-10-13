import { HERO, ITEMS, WRECK } from '@stillwake/content';
import { expect, test, type Page } from '@playwright/test';
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

/** Opens the game and waits for it to run. */
async function start(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => '__game' in window);
}

interface DevGame {
  client: {
    sim: {
      world: {
        slices: {
          debris: { pieces: { id: number; item: string }[] };
          grid: { machines: { kind: string }[] };
        };
      };
    };
    send(c: { module: string; type: string; payload: unknown }): void;
  };
}

/**
 * Catches the first piece of debris of a kind in `of` to drift by into the hotbar's first slot, as a
 * hero out in space would: salvage is the only way to anything. Driven through the
 * dev handle, the hero stepped out for the one tick of the grab; its controller brings it back.
 */
async function catchPiece(page: Page, of: readonly string[] = Object.keys(ITEMS)) {
  await page.waitForFunction(
    (kinds) =>
      (window as unknown as { __game: DevGame }).__game.client.sim.world.slices.debris.pieces.some(
        (p) => kinds.includes(p.item),
      ),
    of,
    { timeout: 45_000 },
  );
  await page.evaluate(
    ({ space, kinds }) => {
      const game = (window as unknown as { __game: DevGame }).__game;
      const piece = game.client.sim.world.slices.debris.pieces.find((p) => kinds.includes(p.item));
      if (!piece) throw new Error('no piece');
      game.client.send({ module: 'crew', type: 'enter', payload: { cell: space } });
      game.client.send({ module: 'debris', type: 'grab', payload: { piece: piece.id } });
    },
    { space: 10 * WRECK[0]!.length + 10, kinds: of },
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

/** Moves the pointer over the middle of the first cell drawn as `char`, and presses E there. */
async function useAt(page: Page, char: string) {
  await pointAt(page, find(char));
  await page.keyboard.press('KeyE');
}

/** Where a crate is built: on the floor right of where the hero wakes, in reach. */
const CRATE = { x: find('S').x + 1, y: find('S').y };

/**
 * Builds a crate beside the hero, as a player would, in creative mode so it costs nothing: its plan
 * sent, then worked with the left button held on it. Opens it with E.
 */
async function buildCrate(page: Page) {
  await page.evaluate(
    (cell) => {
      const game = (window as unknown as { __game: DevGame }).__game;
      game.client.send({ module: 'items', type: 'setCreative', payload: { on: true } });
      const placement = { layer: 'machine', kind: 'crate' };
      game.client.send({ module: 'building', type: 'placePlan', payload: { cell, placement } });
    },
    CRATE.y * WRECK[0]!.length + CRATE.x,
  );
  await pointAt(page, CRATE);
  await page.mouse.down();
  await page.waitForFunction(() =>
    (window as unknown as { __game: DevGame }).__game.client.sim.world.slices.grid.machines.some(
      (m) => m.kind === 'crate',
    ),
  );
  await page.mouse.up();
  await page.keyboard.press('KeyE');
}

test('puts a caught piece into a crate and takes it back into the hotbar', async ({ page }) => {
  await start(page);
  await catchPiece(page);
  await buildCrate(page);
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
  await buildCrate(page);
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

test('smelts a caught piece in the furnace into what it yields', async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  await catchPiece(
    page,
    Object.keys(ITEMS).filter((id) => 'yields' in ITEMS[id as keyof typeof ITEMS]),
  );
  // Once room A is aired the generator's store fills: smelting, which slows the generator, would
  // otherwise starve the room and the furnace alike while the hero breathes there.
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          __game: {
            client: { sim: { world: { slices: { atmosphere: { tanks: { oxygen: number }[] } } } } };
          };
        }
      ).__game.client.sim.world.slices.atmosphere.tanks.some((t) => t.oxygen >= 10),
    null,
    { timeout: 30_000 },
  );
  await useAt(page, 'F');
  // A shift-click sends it into the furnace's input.
  await page.locator('[data-slot="inv-0"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-slot="crate-0"]')).toHaveAttribute('data-item', /./);
  // At 5/8 power, with the furnace drawing, the slowest salvage, a supply pod, smelts in 24 s.
  const longest = Math.max(
    ...Object.values(ITEMS).map((i) => ('smeltTicks' in i ? i.smeltTicks : 0)),
  );
  await expect(page.locator('[data-slot="crate-1"]')).toHaveAttribute('data-item', /./, {
    timeout: ((longest * 8) / 5 / 20) * 1000 + 10_000,
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
