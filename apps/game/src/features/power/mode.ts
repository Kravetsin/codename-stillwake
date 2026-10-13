import { MACHINES, POWER, type MachineSpec } from '@stillwake/content';
import { command, grid, power, type Sim } from '@stillwake/sim';
import { Graphics, Text } from 'pixi.js';
import { t } from '../../i18n/en';
import { distanceTo, endOf, middleOf, type Point } from '../../render/cable';
import type { Camera } from '../../render/camera';
import { CELL, WORLD_TEXT_RESOLUTION } from '../../render/camera';
import type { Game } from '../../session/game';
import { gripAt, lightOf, supportOnWay, type Grip, type Line } from './wiring';

const FITS = 0x7fe08a;
const REFUSED = 0xe05555;
/** A machine a cable from here cannot reach: grey, not wrong. */
const OUT_OF_REACH = 0x9aa3ad;
/** How near a right press must be to a cable, in cells, to cut it. */
const CUT_REACH = 0.35;

/**
 * The power mode's hands (0021): a press on a node lays a cable from it, led on past its reach
 * through supports at the anchors on its way; a press on a support, or on a cable's end at a
 * machine, carries it; a release lays or moves there; a right press cuts the cable under it. While
 * dragging, each powered machine is lit by whether the cable reaches it, and the ghost runs to the
 * pointer in the colour of what the sim would say, its reason beside it.
 */
export function createPowerMode() {
  const ghost = new Graphics();
  const reason = new Text({
    text: '',
    style: {
      fontFamily: 'monospace',
      fontSize: 10,
      fill: 0xffe4e4,
      stroke: { color: 0x0b0f17, width: 3 },
    },
    resolution: WORLD_TEXT_RESOLUTION,
  });
  let grip: Grip | undefined;
  /** The node the cable being laid runs from now: the last support placed, or where it began. */
  let from: number | undefined;

  return {
    views: [ghost, reason] as const,
    update(game: Game, camera: Camera, lines: readonly Line[]) {
      const sim: Sim = game.client.sim;
      const q = sim.query(grid);
      const wires = sim.query(power);
      const { width, height } = q.size();
      const cellAt = (p: Point) => {
        const x = Math.floor(p.x);
        const y = Math.floor(p.y);
        return x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x;
      };
      const isMachine = (node: number) => q.machineAt(node)?.cell === node;
      const lay = (a: number, b: number) => game.client.send(command(power, 'lay', { a, b }));

      for (const at of camera.takeRight()) {
        let best: { line: Line; d: number } | undefined;
        for (const line of lines) {
          const d = distanceTo(line.points, at);
          if (d <= CUT_REACH && (!best || d < best.d)) best = { line, d };
        }
        if (best) game.client.send(command(power, 'cut', { a: best.line.a, b: best.line.b }));
      }

      for (const button of camera.takeLeft()) {
        const cell = cellAt(button.at);
        if (button.down) {
          grip = gripAt(button.at, lines, cell < 0 ? undefined : wires.nodeAt(cell), isMachine);
          from = grip?.node;
          continue;
        }
        if (grip && from !== undefined && cell >= 0 && wires.nodeAt(cell) !== from) {
          if (grip.kind === 'lay') {
            if (!wires.layProblem(game.client.id, from, cell)) lay(from, cell);
          } else {
            const cable = grip.kind === 'end' ? grip.cable : undefined;
            if (!wires.moveProblem(grip.node, cell, cable)) {
              const payload = { from: grip.node, to: cell, ...(cable ? { cable } : {}) };
              game.client.send(command(power, 'move', payload));
            }
          }
        }
        grip = undefined;
        from = undefined;
      }

      ghost.clear();
      reason.text = '';
      const pointer = camera.pointer();
      if (!grip || from === undefined || !pointer) return;
      const target = cellAt(pointer);

      // Led past one cable's reach, the cable is held on the way and goes on from there.
      const start = from;
      if (
        grip.kind === 'lay' &&
        Math.hypot(...offset(middleOf(q, start), pointer)) > POWER.maxSpan
      ) {
        const support = supportOnWay(middleOf(q, start), pointer, width, (c) => {
          const n = wires.nodeAt(c);
          return n !== undefined && n !== start && !wires.layProblem(game.client.id, start, c);
        });
        const node = support === undefined ? undefined : wires.nodeAt(support);
        if (support !== undefined && node !== undefined) {
          lay(start, support);
          from = node;
        }
      }

      const problemAt = (cell: number) =>
        cell < 0
          ? 'power.noNode'
          : grip?.kind === 'lay'
            ? wires.layProblem(game.client.id, from as number, cell)
            : wires.moveProblem(
                (grip as Grip).node,
                cell,
                grip?.kind === 'end' ? grip.cable : undefined,
              );

      // Each powered machine lit by whether the cable reaches it.
      for (const m of q.machines()) {
        const spec: MachineSpec = MACHINES[m.kind];
        if (spec.makes === undefined && spec.draws === undefined) continue;
        if (m.cell === from) continue;
        const why = problemAt(m.cell);
        const colour = { fits: FITS, far: OUT_OF_REACH, refused: REFUSED }[lightOf(why)];
        ghost
          .rect(
            (m.cell % width) * CELL,
            Math.floor(m.cell / width) * CELL,
            spec.width * CELL,
            spec.height * CELL,
          )
          .fill({ color: colour, alpha: why ? 0.12 : 0.25 });
      }

      const why = problemAt(target);
      const colour = why ? REFUSED : FITS;
      // From each end the dragged one leaves behind, or from where the new cable runs.
      const ends =
        grip.kind === 'lay'
          ? [from]
          : lines
              .filter((l) =>
                grip?.kind === 'end' ? l.a === grip.cable.a && l.b === grip.cable.b : true,
              )
              .filter((l) => l.a === grip?.node || l.b === grip?.node)
              .map((l) => (l.a === grip?.node ? l.b : l.a));
      for (const end of ends) {
        const p = endOf(q, end, pointer);
        ghost.moveTo(p.x * CELL, p.y * CELL).lineTo(pointer.x * CELL, pointer.y * CELL);
      }
      ghost.stroke({ width: 1.5, color: colour, alpha: 0.9 });
      if (target >= 0) {
        ghost
          .rect((target % width) * CELL, Math.floor(target / width) * CELL, CELL, CELL)
          .stroke({ width: 1, color: colour });
      }
      if (why && why !== 'power.sameNode') {
        reason.text = t(why);
        reason.position.set(pointer.x * CELL + 12, pointer.y * CELL + 12);
      }
    },
    /** Lets go of whatever is held: the mode turned off mid-drag. */
    release() {
      grip = undefined;
      from = undefined;
      ghost.clear();
      reason.text = '';
    },
  };
}

function offset(a: Point, b: Point): [number, number] {
  return [b.x - a.x, b.y - a.y];
}
