import { atmosphere, CONDUIT, grid, pipes, power } from '@stillwake/sim';
import { Container, Graphics, Sprite } from 'pixi.js';
import { CELL } from '../../render/camera';
import type { Feature, Layer } from '../feature';
import { socketTexture } from './art';
import { dotsOf, runsOf, stepsFrom, type Run } from './flow';
import { colourOf } from './oxygen';

const VALVE_OPEN = 0x4caf6a;
const VALVE_CLOSED = 0xd05050;
const REFRESH_MS = 250;
/** What the overlay lays over the ship, so the pipes stand out from it. */
const DIM = { color: 0x05080d, alpha: 0.45 };
/** A network with no oxygen coming into it, against one with: faded. */
const DRY_ALPHA = 0.45;
/** Oxygen's dots: how fast they run, in cells a second, and how many cells apart. */
const FLOW_SPEED = 2;
const DOT_EVERY = 3;

/**
 * Every pipe network brought out of the ship: the ship dimmed and each network's pipes over it,
 * slim, in a colour of their own, so a player sees which tanks and generators reach which vents.
 * Where oxygen comes into a network, from a tank holding some or a powered generator, dots run along
 * its pipes away from it; a network none comes into is faded and still. A valve shows its state in
 * colour, a closed one where two networks meet without joining; a socket shows where each machine
 * takes a pipe, which only matters here. Out of the overlay, the grid draws the pipes themselves.
 */
function pipesOverlay(): Layer {
  const dim = new Graphics();
  const lines = new Graphics();
  const sockets = new Container();
  const flow = new Graphics();
  const view = new Container();
  view.addChild(dim, lines, sockets, flow);
  let since = Infinity;
  let shown = -1;
  let runs: { run: Run; colour: number }[] = [];
  let along = 0;
  return {
    view,
    update({ game, elapsedMs }) {
      along += (elapsedMs / 1000) * FLOW_SPEED;
      flow.clear();
      for (const { run, colour } of runs) {
        for (const dot of dotsOf([run], along, DOT_EVERY)) {
          flow.rect(dot.x * CELL - 1, dot.y * CELL - 1, 2, 2).fill({ color: 0xffffff, alpha: 0.9 });
          flow.rect(dot.x * CELL - 2, dot.y * CELL - 2, 4, 4).fill({ color: colour, alpha: 0.35 });
        }
      }

      const { sim } = game.client;
      since += elapsedMs;
      if (since < REFRESH_MS || sim.world.tick === shown) return;
      since = 0;
      shown = sim.world.tick;
      const q = sim.query(grid);
      const cells = q.layers();
      const { width, height } = cells;
      const byId = new Map(q.machines().map((m) => [m.id, m]));
      // A tank holding oxygen feeds its pipes; a powered generator does, its store empty or not.
      const feeds = (id: number) => {
        const m = byId.get(id);
        if (m?.kind === 'generator') return sim.query(power).satisfaction(id) > 0;
        return m?.kind === 'tank' && sim.query(atmosphere).oxygenIn(id) > 0;
      };

      dim
        .clear()
        .rect(0, 0, width * CELL, height * CELL)
        .fill(DIM);
      lines.clear();
      runs = [];
      sim
        .query(pipes)
        .networks()
        .forEach((network, i) => {
          const own = new Set(network.cells);
          const colour = colourOf(i);
          // Slim, as the pipe drawn under it, reaching toward the neighbours of its own network.
          for (const cell of network.cells) {
            const cx = (cell % width) * CELL + CELL / 2;
            const cy = Math.floor(cell / width) * CELL + CELL / 2;
            lines.rect(cx - 2, cy - 2, 4, 4);
            const x = cell % width;
            if (x < width - 1 && own.has(cell + 1)) lines.rect(cx, cy - 1, CELL / 2, 2);
            if (x > 0 && own.has(cell - 1)) lines.rect(cx - CELL / 2, cy - 1, CELL / 2, 2);
            if (own.has(cell + width)) lines.rect(cx - 1, cy, 2, CELL / 2);
            if (own.has(cell - width)) lines.rect(cx - 1, cy - CELL / 2, 2, CELL / 2);
          }
          const sources = network.machines.filter(feeds).flatMap((id) => {
            const m = byId.get(id);
            return m ? q.portsOf(m) : [];
          });
          lines.fill({ color: colour, alpha: sources.length > 0 ? 1 : DRY_ALPHA });
          for (const run of runsOf(stepsFrom(network.cells, width, sources), width)) {
            runs.push({ run, colour });
          }
        });
      for (const [state, colour] of [
        [CONDUIT.valveOpen, VALVE_OPEN],
        [CONDUIT.valveClosed, VALVE_CLOSED],
      ] as const) {
        cells.conduit.forEach((c, cell) => {
          if (c !== state) return;
          const cx = (cell % width) * CELL + CELL / 2;
          const cy = Math.floor(cell / width) * CELL + CELL / 2;
          lines.rect(cx - 3, cy - 3, 6, 6);
        });
        lines.fill(colour).stroke({ width: 1, color: 0x10161d });
      }

      for (const socket of sockets.removeChildren()) socket.destroy();
      for (const m of q.machines()) {
        for (const port of q.portsOf(m)) {
          const socket = new Sprite(socketTexture());
          socket.position.set(
            (port % width) * CELL + CELL / 2 - 4,
            Math.floor(port / width) * CELL + CELL / 2 - 4,
          );
          sockets.addChild(socket);
        }
      }
    },
  };
}

/** An overlay of every pipe network and where oxygen is in it; the grid draws the pipes themselves. */
export const pipesFeature: Feature = {
  id: 'pipes',
  overlay: { name: 'overlay.pipes', key: 'KeyP', layer: pipesOverlay },
};
