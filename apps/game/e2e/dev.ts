import { INVENTORY } from '@stillwake/content';
import type { Page } from '@playwright/test';

/** What the tests read of the dev handle (`window.__game`): the world and sending commands. */
export interface DevGame {
  client: {
    sim: {
      world: {
        slices: {
          debris: { pieces: { id: number }[] };
          grid: { machines: { id: number; kind: string }[] };
          items: { inventories: { peer: number; slots: unknown[] }[] };
          research: { known: string[] };
          building: { plans: readonly object[] };
        };
      };
    };
    send(c: { module: string; type: string; payload: unknown }): void;
  };
}

/** Opens the game and waits for it to run. */
export async function start(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => '__game' in window);
}

/** Sends one command as this player, through the dev handle. */
export async function send(page: Page, module: string, type: string, payload: unknown) {
  await page.evaluate((c) => (window as unknown as { __game: DevGame }).__game.client.send(c), {
    module,
    type,
    payload,
  });
}

/**
 * For tests only: puts `stacks` into the hero's first slots straight into the world, as the sim's
 * tests do: no command makes items out of nothing, and waiting for a cargo crate to drift by would
 * take minutes. Peer 0's world is the only one: the host keeps none.
 */
export async function gift(page: Page, stacks: readonly { item: string; count: number }[]) {
  await page.evaluate(
    ({ stacks, slots }) => {
      const items = (window as unknown as { __game: DevGame }).__game.client.sim.world.slices.items;
      let own = items.inventories.find((inv) => inv.peer === 0);
      if (!own) {
        own = { peer: 0, slots: Array(slots).fill(null) };
        items.inventories.unshift(own);
      }
      stacks.forEach((stack, i) => {
        if (own) own.slots[i] = stack;
      });
    },
    { stacks, slots: INVENTORY.slots },
  );
}
