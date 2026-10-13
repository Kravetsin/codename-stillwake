import { MACHINES, POWER, type MachineSpec } from '@stillwake/content';
import { command, grid, power, type Sim } from '@stillwake/sim';
import { Graphics, Text } from 'pixi.js';
import { t } from '../../i18n/en';
import { distanceTo, endOf, middleOf, type Point } from '../../render/cable';
import type { Camera } from '../../render/camera';
import { CELL, WORLD_TEXT_RESOLUTION } from '../../render/camera';
import type { Game } from '../../session/game';
import { hand } from '../../session/ui';
import { traceRope, type Rope } from '../../render/rope';
import { hangFor, layingRope, type Held, type Laid } from './ropes';
import { gripAt, lightOf, supportOnWay, type Grip, type Line } from './wiring';

const FITS = 0x7fe08a;
const REFUSED = 0xe05555;
/** A machine a cable from here cannot reach: grey, not wrong. */
const OUT_OF_REACH = 0x9aa3ad;
/** How near a right press must be to a cable, in cells, to cut it. */
const CUT_REACH = 0.35;

/**
 * The hands at work on cables in the power overlay (0021, 0022): with the cable in hand, a press on a
 * node lays a cable from it, led on past its reach through supports at the anchors on its way, and a
 * press with Shift on a support, or on a cable's end at a machine, carries it, as a plain press does
 * with the plan out and no card; a release lays or moves there. With the cable or the plan in hand, a right press cuts the cable under it. While
 * dragging, each powered machine's socket is lit by whether the cable reaches it, and the ghost runs
 * to the pointer in the colour of what the sim would say, its reason beside it.
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
  /** The cable's end carried now, and whether it may be let go where it is. */
  let carried: { end: Held; fits: boolean } | undefined;
  /** The cable being laid, as the rope it will be. */
  let rope: Rope | undefined;
  /** Cables laid since told, with the ropes they were laid as. */
  let laid: Laid[] = [];
  /** The node a cable was last carried to, and its end there, until told. */
  let landing: { node: number; end: Held } | undefined;

  return {
    views: [ghost, reason] as const,
    update(game: Game, camera: Camera, lines: readonly Line[], elapsedMs: number) {
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
      // Laid, the cable goes on as the rope it was laid as.
      const lay = (a: number, b: number) => {
        game.client.send(command(power, 'lay', { a, b }));
        const to = wires.nodeAt(b);
        if (rope && to !== undefined) {
          laid.push({ a, b: to, from: endOf(q, a), to: endOf(q, to), rope });
        }
        rope = undefined;
      };

      const holds = hand.get();
      // The right button cuts with something in hand; an empty hand takes nothing apart.
      for (const { down, at } of camera.takeRight()) {
        if (!down || holds === 'free') continue;
        let best: { line: Line; d: number } | undefined;
        for (const line of lines) {
          const d = distanceTo(line.points, at);
          if (d <= CUT_REACH && (!best || d < best.d)) best = { line, d };
        }
        if (best) game.client.send(command(power, 'cut', { a: best.line.a, b: best.line.b }));
      }

      // The left button is the cable's, and the plan's with no card: it carries pegs and plugs.
      // Another card's, or an empty hand's, is the building's.
      const wiring = holds === 'cable' || holds === 'plan';
      if (!wiring) {
        grip = undefined;
        from = undefined;
        rope = undefined;
      }
      for (const button of wiring ? camera.takeLeft() : []) {
        const cell = cellAt(button.at);
        if (button.down) {
          const node = cell < 0 ? undefined : wires.nodeAt(cell);
          // With the cable, laid from whatever node is pressed, a peg too; with Shift held at the
          // press, or with no card, a peg or a plug is carried and nothing is laid.
          const held = gripAt(button.at, lines, node, isMachine);
          grip =
            holds === 'cable' && !button.shift
              ? node === undefined
                ? undefined
                : { kind: 'lay', node }
              : held?.kind === 'lay'
                ? undefined
                : held;
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
              const to = wires.nodeAt(cell);
              if (to !== undefined) {
                const end = { node: grip.node, at: endOf(q, to), ...(cable ? { cable } : {}) };
                landing = { node: to, end };
              }
            }
          }
        }
        grip = undefined;
        from = undefined;
        rope = undefined;
      }

      ghost.clear();
      reason.text = '';
      carried = undefined;
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

      // Each powered machine's socket lit by whether the cable reaches it: where it would plug in.
      for (const m of q.machines()) {
        const spec: MachineSpec = MACHINES[m.kind];
        if (!spec.plug || m.cell === from) continue;
        const colour = { fits: FITS, far: OUT_OF_REACH, refused: REFUSED }[
          lightOf(problemAt(m.cell))
        ];
        const at = endOf(q, m.cell);
        ghost
          .circle(at.x * CELL, at.y * CELL, 6)
          .fill({ color: colour, alpha: 0.25 })
          .rect(at.x * CELL - 3, at.y * CELL - 3, 6, 6)
          .stroke({ width: 1, color: colour });
      }

      const why = problemAt(target);
      // Where it would go, it runs to where it would end: a machine's socket, an anchor's middle.
      const node = why ? undefined : wires.nodeAt(target);
      const to = node === undefined ? pointer : endOf(q, node);
      if (grip.kind === 'lay') {
        // The cable laid is a rope already, hanging from where it runs to the hand.
        const p = endOf(q, from);
        rope ??= layingRope(p);
        rope.update(p, to, elapsedMs, hangFor, []);
        traceRope(ghost, rope.points(), CELL);
        ghost.stroke({ width: 1.5, color: why ? REFUSED : FITS, alpha: 0.9, cap: 'round' });
      } else {
        // A cable carried is the cable itself, its end in hand.
        const cable = grip.kind === 'end' ? grip.cable : undefined;
        carried = { end: { node: grip.node, at: to, ...(cable ? { cable } : {}) }, fits: !why };
      }
      if (why && why !== 'power.sameNode') {
        reason.text = t(why);
        reason.position.set(pointer.x * CELL + 12, pointer.y * CELL + 12);
      }
    },
    /** The cable's end carried now, and whether it may be let go where it is; nothing if none. */
    carried: () => carried,
    /** The node a cable was last carried to and its end there, once: the cables layer lands it. */
    takeLanding() {
      const taken = landing;
      landing = undefined;
      return taken;
    },
    /** The cables laid since asked, with the ropes they were laid as: the cables layer takes them. */
    takeLaid() {
      const taken = laid;
      laid = [];
      return taken;
    },
    /** Lets go of whatever is held: the mode turned off mid-drag. */
    release() {
      grip = undefined;
      from = undefined;
      rope = undefined;
      carried = undefined;
      ghost.clear();
      reason.text = '';
    },
  };
}

function offset(a: Point, b: Point): [number, number] {
  return [b.x - a.x, b.y - a.y];
}
