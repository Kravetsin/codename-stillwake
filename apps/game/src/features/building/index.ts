import {
  building,
  grid,
  power,
  research,
  rooms,
  type Placement,
  type Plan,
  type QueryApi,
} from '@stillwake/sim';
import { Container, Graphics, Text } from 'pixi.js';
import { t } from '../../i18n/en';
import type { Point } from '../../render/cable';
import { CELL, WORLD_TEXT_RESOLUTION, type Button } from '../../render/camera';
import { costLines } from '../../render/CostRow';
import { EFFECTS, particles } from '../../render/particles';
import { hand, overlayOn, pointerTip } from '../../session/ui';
import type { Feature } from '../feature';
import { piecesOf } from '../../render/blueprint-art';
import { createSprites, joins, linksOf } from './blueprint';
import { judge, lineOf, onGrid, spotAt, type Act, type Spot, type Verdict } from './drag';
import { nearGrid } from './near-grid';
import { BuildMenu } from './BuildMenu';
import { cardAt, layersFor, POWER, putPlanAway, selected } from './tools';

/** A plan's tint: its own picture, blue, not built yet. */
const PLAN = 0x5fd0ff;
const MARK = 0xe05555;
const FITS = 0x7fe08a;
const REFUSED = 0xe05555;
const BAR = 0xf2f5fa;
/** The bar of a blueprint still being delivered to: what it has, in the colour of materials. */
const DELIVERED = 0xe8b04a;
const BAR_BACK = 0x0b0f17;
const GRID_LINE = 0x9fb4c8;
/** Sparks per tick of work done on a plan: a hand at work throws one now and then. */
const SPARKS_PER_TICK = 0.3;

/**
 * Plans drawn over the ship as their own pictures in blue, marks as red crosses, and the hand at work
 * (0022): a card's ghost along a left drag, a removal's along a right one in the overlay's layers,
 * coloured by what the sim would say, with its reason by the pointer; a release sends the commands.
 * The middle button picks a card. With no card out, no grid: space stays space.
 */
export const buildingFeature: Feature = {
  id: 'building',
  Panel: BuildMenu,
  layer() {
    const planSprites = new Container();
    const plansView = new Graphics();
    const near = new Graphics();
    const ghostSprites = new Container();
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
    view.addChild(near, planSprites, plansView, ghostSprites, ghost, reason);
    const blueprints = createSprites(planSprites);
    const ghosts = createSprites(ghostSprites);

    let drawn = '';
    /** Each plan's work done when last seen, and the sparks owed to it. */
    let worked = new Map<number, number>();
    let owedSparks = 0;
    /** The drag under way: what it does, the button that began it and the cell it began on. */
    let drag: { act: Act; button: 'left' | 'right'; from: Spot } | undefined;
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
          drawPlans(blueprints, plansView, plans, size.width, q);
          sparkWork(plans, worked, size.width, q, sim.query(rooms), (n) => {
            owedSparks += n * SPARKS_PER_TICK;
            const count = Math.floor(owedSparks);
            owedSparks -= count;
            return count;
          });
          worked = new Map(plans.map((p) => [p.id, p.progress]));
        }

        const tool = selected.get();
        const holds = hand.get();
        const overlay = overlayOn.get();
        const cellAt = (p: Point) => {
          const s = spotAt(size, p);
          return s.y * size.width + s.x;
        };
        const send = (act: Act, from: Spot, to: Spot) => {
          for (const verdict of judge(act, lineOf(size.width, act, from, to), q)) {
            for (const c of verdict.commands) game.client.send(c);
          }
        };
        // A drag ends with the hand that began it: a card swapped or put away mid-drag sends nothing.
        if (drag && (drag.act.kind === 'remove' ? holds === 'free' : drag.act !== tool)) {
          drag = undefined;
        }

        const dragWith = (button: Button, act: Act, which: 'left' | 'right') => {
          if (button.down) {
            // The first button down has the drag; another pressed meanwhile is let be.
            if (!drag && onGrid(size, button.at)) {
              drag = { act, button: which, from: spotAt(size, button.at) };
            }
            return;
          }
          if (drag?.button !== which) return;
          send(drag.act, drag.from, spotAt(size, button.at));
          drag = undefined;
        };
        // The left button is the card's, but for the cable, which the power feature lays, and but
        // for the plan out with no card under the power overlay, where it carries pegs and plugs.
        const wiring = holds === 'cable' || (holds === 'plan' && overlay === POWER);
        for (const button of wiring ? [] : camera.takeLeft()) {
          if (tool?.kind !== 'place') continue;
          dragWith(button, tool, 'left');
        }
        // The right button removes with the plan in hand; under the power overlay it cuts cables,
        // the power feature's.
        for (const button of overlay === POWER ? [] : camera.takeRight()) {
          if (holds === 'free') continue;
          dragWith(button, { kind: 'remove', layers: layersFor(overlay) }, 'right');
        }
        // The middle button picks the card of what is under it.
        for (const at of camera.takeMiddle()) {
          if (!onGrid(size, at)) continue;
          const card = cardAt(cellAt(at), overlay, {
            ...q,
            power: sim.query(power),
            research: sim.query(research),
          });
          if (!card) continue;
          selected.set(card);
        }

        ghost.clear();
        ghosts.begin();
        near.clear();
        reason.text = '';
        const pointer = camera.pointer();
        showTray(pointer && onGrid(size, pointer) ? cellAt(pointer) : undefined, q);
        if (tool?.kind === 'place' && pointer) {
          for (const e of nearGrid(pointer, size)) {
            near
              .moveTo(e.x1 * CELL, e.y1 * CELL)
              .lineTo(e.x2 * CELL, e.y2 * CELL)
              .stroke({ width: 1, color: GRID_LINE, alpha: e.alpha });
          }
        }
        const act: Act | undefined = drag?.act ?? (tool?.kind === 'place' ? tool : undefined);
        if (!act || !pointer || (!drag && !onGrid(size, pointer))) return;
        const end = spotAt(size, pointer);
        const verdicts = judge(act, lineOf(size.width, act, drag?.from ?? end, end), q);
        if (act.kind === 'place') {
          drawGhost(ghosts, act.placement, verdicts, size.width);
        } else {
          for (const v of verdicts) {
            const colour = v.problem ? REFUSED : FITS;
            const box = boxOf([v.cell], size.width);
            ghost
              .rect(box.x, box.y, box.w, box.h)
              .fill({ color: colour, alpha: 0.3 })
              .stroke({ width: 1, color: colour });
          }
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
 * The ghost of `placement` along a drag: its own pictures, as a plan of it would be drawn, green
 * where the sim would take it and red where not, pipes reaching along the line.
 */
function drawGhost(
  ghosts: ReturnType<typeof createSprites>,
  placement: Placement,
  verdicts: readonly Verdict[],
  width: number,
) {
  const cells = new Set(verdicts.map((v) => v.cell));
  const together = joins(placement, placement);
  for (const v of verdicts) {
    const linked = together ? linksOf(v.cell, width, (c) => cells.has(c)) : 0;
    for (const piece of piecesOf(placement, v.cell, width, linked)) {
      ghosts.lay(piece, v.problem ? REFUSED : FITS, 0.75);
    }
  }
}

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

/**
 * Sparks off every plan whose work went on since `worked` was taken, from its middle: falling aboard,
 * drifting off in space. `sparks` turns ticks of work into how many fly.
 */
function sparkWork(
  plans: readonly Plan[],
  worked: ReadonlyMap<number, number>,
  width: number,
  q: { readonly grid: QueryApi<typeof grid> },
  where: QueryApi<typeof rooms>,
  sparks: (ticks: number) => number,
) {
  for (const p of plans) {
    const was = worked.get(p.id);
    if (was === undefined || p.progress <= was) continue;
    const count = sparks(p.progress - was);
    if (count === 0) continue;
    const machine =
      'place' in p
        ? p.place.layer === 'machine' && { kind: p.place.kind, cell: p.cell }
        : p.clear === 'machine' && q.grid.machineAt(p.cell);
    const cells = machine ? (q.grid.footprint(machine.kind, machine.cell) ?? [p.cell]) : [p.cell];
    const box = boxOf(cells, width);
    const at = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    particles.emit(EFFECTS.spark, at, count, -Math.PI / 2, where.roomAt(p.cell) === 'space');
  }
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
 * Plans as their own pictures in blue (`blueprints`), pipes and doors joined to the plans beside them,
 * back walls fainter; marks as red crosses over what they take out; and a bar along the bottom of each
 * plan: a blueprint's share delivered while it lacks something, in amber, then the work done, in white.
 */
function drawPlans(
  blueprints: ReturnType<typeof createSprites>,
  g: Graphics,
  plans: readonly Plan[],
  width: number,
  q: { readonly grid: QueryApi<typeof grid>; readonly building: QueryApi<typeof building> },
) {
  g.clear();
  blueprints.begin();
  const placed = new Map<number, Placement[]>();
  for (const p of plans)
    if ('place' in p) placed.set(p.cell, [...(placed.get(p.cell) ?? []), p.place]);
  // Back walls first: behind whatever else is planned in their cells.
  const order = [...plans].sort(
    (a, b) =>
      Number('place' in b && b.place.layer === 'back') -
      Number('place' in a && a.place.layer === 'back'),
  );
  for (const p of order) {
    if (!('place' in p)) continue;
    const place = p.place;
    const linked = linksOf(p.cell, width, (c) =>
      (placed.get(c) ?? []).some((o) => joins(place, o)),
    );
    for (const piece of piecesOf(place, p.cell, width, linked)) {
      blueprints.lay(piece, PLAN, place.layer === 'back' ? 0.35 : 0.75);
    }
  }
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
