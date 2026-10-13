import { building, command, grid, power, rooms, type Plan, type QueryApi } from '@stillwake/sim';
import { Container, Graphics, Text } from 'pixi.js';
import { t } from '../../i18n/en';
import {
  cablePoints,
  distanceTo,
  endOf,
  hangsAt,
  middleOf,
  shapeOf,
  type Point,
} from '../../render/cable';
import { CELL, WORLD_TEXT_RESOLUTION } from '../../render/camera';
import { costLines } from '../../render/CostRow';
import { overlayOn, pointerTip } from '../../session/ui';
import type { Feature } from '../feature';
import { judge, lineOf, onButton, onGrid, spotAt, type Spot } from './drag';
import { nearGrid } from './near-grid';
import { BuildMenu } from './BuildMenu';
import { putPlanAway, selected } from './tools';

const PLAN = 0x5fd0ff;
const MARK = 0xe05555;
const FITS = 0x7fe08a;
const REFUSED = 0xe05555;
const BAR = 0xf2f5fa;
/** The bar of a blueprint still being delivered to: what it has, in the colour of materials. */
const DELIVERED = 0xe8b04a;
const BAR_BACK = 0x0b0f17;
const GRID_LINE = 0x9fb4c8;
/** How near a Remove click must be to a cable, in cells, to cut it. */
const CUT_REACH = 0.35;

/**
 * Plans and marks drawn over the ship, and the selected tool at work: the grid around the pointer,
 * fading out, and a ghost along the drag, coloured by what the sim would say, with its reason by the
 * pointer. A release sends the commands. With no tool out, no grid: space stays space.
 */
export const buildingFeature: Feature = {
  id: 'building',
  Panel: BuildMenu,
  layer() {
    const plansView = new Graphics();
    const near = new Graphics();
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
    const view = new Container();
    view.addChild(near, plansView, ghost, reason);

    let drawn = '';
    let pressed: Spot | undefined;
    /** The node a cable is being laid from, while the button is held. */
    let cableFrom: number | undefined;
    return {
      view,
      update({ game, camera }) {
        const sim = game.client.sim;
        const q = { grid: sim.query(grid), building: sim.query(building) };
        const size = q.grid.size();

        const plans = q.building.plans();
        // Ids alone would miss a load that brings other plans under the same ids.
        // What was delivered and the work done are in the key, so bars grow as they go on.
        const key = plans.map((p) =>
          'place' in p
            ? `${p.id}:${p.cell}:${p.place.kind}:${JSON.stringify(p.delivered)}:${p.progress}`
            : `${p.id}:${p.cell}:${p.clear}:${p.progress}`,
        );
        if (key.join() !== drawn) {
          drawn = key.join();
          drawPlans(plansView, plans, size.width, q);
        }

        const tool = selected.get();
        const shape = { grid: q.grid, rooms: sim.query(rooms) };
        const wires = sim.query(power);
        const cellAt = (p: Point) => {
          const s = spotAt(size, p);
          return s.y * size.width + s.x;
        };
        /** The cable a Remove click at `p` cuts: the nearest within reach. */
        const cableNear = (p: Point) => {
          let best: { a: number; b: number; d: number } | undefined;
          for (const c of wires.cables()) {
            const d = distanceTo(shapeOf(shape, c.a, c.b), p);
            if (d <= CUT_REACH && (!best || d < best.d)) best = { a: c.a, b: c.b, d };
          }
          return best;
        };
        for (const button of camera.takeLeft()) {
          if (!tool) continue;
          if (tool.kind === 'cable') {
            const at = onGrid(size, button.at) ? cellAt(button.at) : undefined;
            if (button.down) cableFrom = at === undefined ? undefined : wires.nodeAt(at);
            else if (cableFrom !== undefined && at !== undefined) {
              if (!wires.layProblem(game.client.id, cableFrom, at)) {
                game.client.send(command(power, 'lay', { a: cableFrom, b: at }));
              }
              cableFrom = undefined;
            }
            continue;
          }
          const next = onButton(pressed, button, size);
          // With the cables in sight, a click, not a drag, by one cuts it before what is behind.
          const clicked =
            next.line && next.line[0].x === next.line[1].x && next.line[0].y === next.line[1].y;
          const cut =
            tool.kind === 'remove' && clicked && overlayOn.get() === 'power'
              ? cableNear(button.at)
              : undefined;
          pressed = next.pressed;
          if (cut) {
            game.client.send(command(power, 'cut', { a: cut.a, b: cut.b }));
            continue;
          }
          if (!next.line) continue;
          for (const verdict of judge(tool, lineOf(size.width, tool, ...next.line), q)) {
            for (const c of verdict.commands) game.client.send(c);
          }
        }
        if (!tool) pressed = undefined;
        if (tool?.kind !== 'cable') cableFrom = undefined;

        ghost.clear();
        near.clear();
        reason.text = '';
        const pointer = camera.pointer();
        showTray(pointer && onGrid(size, pointer) ? cellAt(pointer) : undefined, q);
        if (tool?.kind === 'cable') {
          // The power overlay, on with the tool, rings the nodes and says how each network stands.
          if (!pointer || cableFrom === undefined) return;
          const over = onGrid(size, pointer) ? wires.nodeAt(cellAt(pointer)) : undefined;
          // The ghost reaches for the node under the pointer, or hangs from the pointer itself.
          const toward = over === undefined ? pointer : middleOf(q.grid, over);
          const end =
            over === undefined ? pointer : endOf(q.grid, over, middleOf(q.grid, cableFrom));
          const start = endOf(q.grid, cableFrom, toward);
          const hangs =
            hangsAt(shape, cableFrom) &&
            (over === undefined || hangsAt(shape, over)) &&
            (!onGrid(size, pointer) || hangsAt(shape, cellAt(pointer)));
          const problem =
            over === undefined
              ? 'power.noNode'
              : wires.layProblem(game.client.id, cableFrom, cellAt(pointer));
          drawLine(ghost, cablePoints(start, end, hangs), problem ? REFUSED : FITS);
          if (problem) {
            reason.text = t(problem);
            reason.position.set(pointer.x * CELL + 12, pointer.y * CELL + 12);
          }
          return;
        }
        if (tool?.kind === 'remove' && pointer && overlayOn.get() === 'power') {
          const cable = cableNear(pointer);
          if (cable) {
            drawLine(ghost, shapeOf(shape, cable.a, cable.b), REFUSED);
            return;
          }
        }
        if (tool && pointer) {
          for (const e of nearGrid(pointer, size)) {
            near
              .moveTo(e.x1 * CELL, e.y1 * CELL)
              .lineTo(e.x2 * CELL, e.y2 * CELL)
              .stroke({ width: 1, color: GRID_LINE, alpha: e.alpha });
          }
        }
        if (!tool || !pointer || (!pressed && !onGrid(size, pointer))) return;
        const end = spotAt(size, pointer);
        const verdicts = judge(tool, lineOf(size.width, tool, pressed ?? end, end), q);
        for (const v of verdicts) {
          const colour = v.problem ? REFUSED : FITS;
          const cells =
            tool.kind === 'place' && tool.placement.layer === 'machine'
              ? (q.grid.footprint(tool.placement.kind, v.cell) ?? [v.cell])
              : [v.cell];
          const box = boxOf(cells, size.width);
          ghost
            .rect(box.x, box.y, box.w, box.h)
            .fill({ color: colour, alpha: 0.3 })
            .stroke({ width: 1, color: colour });
        }
        const refused = verdicts.find((v) => v.problem);
        if (refused?.problem) {
          reason.text = t(refused.problem);
          reason.position.set(pointer.x * CELL + 12, pointer.y * CELL + 12);
        }
      },
      destroy() {
        pointerTip.set({ ...pointerTip.get(), cost: undefined });
        // The plan belongs to this game's world; a new one starts with it put away.
        putPlanAway();
      },
    };
  },
};

/**
 * Beside the pointer (`pointerTip.cost`), what the blueprint at `cell` has against what it costs,
 * while it still lacks something; nothing anywhere else. Told only when it changes.
 */
function showTray(
  cell: number | undefined,
  q: { readonly building: QueryApi<typeof building> },
): void {
  const plan =
    cell === undefined
      ? undefined
      : q.building
          .plansAt(cell)
          .find((p) => 'place' in p && Object.keys(q.building.lacking(p.id)).length > 0);
  const cost = plan && 'place' in plan ? q.building.costOf(plan.id) : undefined;
  const lines = plan && 'place' in plan && cost ? costLines(cost, plan.delivered) : undefined;
  if (JSON.stringify(lines) !== JSON.stringify(pointerTip.get().cost)) {
    pointerTip.set({ ...pointerTip.get(), cost: lines });
  }
}

/** A cable's points as a line in pixels of the world. */
function drawLine(g: Graphics, points: readonly Point[], colour: number) {
  points.forEach((p, i) =>
    i === 0 ? g.moveTo(p.x * CELL, p.y * CELL) : g.lineTo(p.x * CELL, p.y * CELL),
  );
  g.stroke({ width: 3, color: colour, alpha: 0.8, cap: 'round', join: 'round' });
}

/** The rectangle around `cells`, in pixels of the world. */
function boxOf(cells: readonly number[], width: number) {
  const xs = cells.map((c) => c % width);
  const ys = cells.map((c) => Math.floor(c / width));
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x: x * CELL,
    y: y * CELL,
    w: (Math.max(...xs) - x + 1) * CELL,
    h: (Math.max(...ys) - y + 1) * CELL,
  };
}

/**
 * Plans as translucent shapes by layer, marks as red crosses over what they take out, and a bar
 * along the bottom of each plan: a blueprint's share delivered while it lacks something, in amber,
 * then the work done, in white.
 */
function drawPlans(
  g: Graphics,
  plans: readonly Plan[],
  width: number,
  q: { readonly grid: QueryApi<typeof grid>; readonly building: QueryApi<typeof building> },
) {
  g.clear();
  for (const p of plans) {
    const machine =
      'place' in p
        ? p.place.layer === 'machine' && { kind: p.place.kind, cell: p.cell }
        : p.clear === 'machine' && q.grid.machineAt(p.cell);
    const cells = machine ? (q.grid.footprint(machine.kind, machine.cell) ?? [p.cell]) : [p.cell];
    const { x, y, w, h } = boxOf(cells, width);
    if ('clear' in p) {
      g.moveTo(x + 4, y + 4)
        .lineTo(x + w - 4, y + h - 4)
        .moveTo(x + w - 4, y + 4)
        .lineTo(x + 4, y + h - 4)
        .stroke({ width: 2, color: MARK });
    } else if (p.place.layer === 'conduit') {
      g.rect(x, y + h / 2 - 2, w, 4).fill({ color: PLAN, alpha: 0.7 });
    } else if (p.place.layer === 'back') {
      // Faint and edgeless: behind whatever else is planned in the cell.
      g.rect(x, y, w, h).fill({ color: PLAN, alpha: 0.12 });
    } else {
      g.rect(x + 2, y + 2, w - 4, h - 4)
        .fill({ color: PLAN, alpha: p.place.layer === 'machine' ? 0.15 : 0.25 })
        .stroke({ width: p.place.layer === 'machine' ? 2 : 1, color: PLAN });
    }
    // A blueprint still lacking something shows the share delivered; then, as any plan, the work
    // done.
    const lacks = 'place' in p && Object.keys(q.building.lacking(p.id)).length > 0;
    const cost = lacks ? q.building.costOf(p.id) : undefined;
    const sum = (c: Partial<Record<string, number>>) =>
      Object.values(c).reduce((total: number, n) => total + (n ?? 0), 0);
    const share = lacks
      ? sum('place' in p ? p.delivered : {}) / Math.max(1, sum(cost ?? {}))
      : p.progress / (q.building.ticksFor(p.id) ?? 1);
    if (share > 0) {
      g.rect(x + 2, y + h - 5, w - 4, 3).fill({ color: BAR_BACK });
      g.rect(x + 2, y + h - 5, (w - 4) * share, 3).fill({ color: lacks ? DELIVERED : BAR });
    }
  }
}
