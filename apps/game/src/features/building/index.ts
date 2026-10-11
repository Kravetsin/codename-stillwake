import { building, grid, type Plan, type QueryApi } from '@stillwake/sim';
import { Container, Graphics, Text } from 'pixi.js';
import { t } from '../../i18n/en';
import { CELL } from '../../render/camera';
import type { Feature } from '../feature';
import { judge, lineOf, onButton, onGrid, spotAt, type Spot } from './drag';
import { nearGrid } from './near-grid';
import { Toolbar } from './Toolbar';
import { selected } from './tools';

const PLAN = 0x5fd0ff;
const MARK = 0xe05555;
const FITS = 0x7fe08a;
const REFUSED = 0xe05555;
const BAR = 0xf2f5fa;
const BAR_BACK = 0x0b0f17;
const GRID_LINE = 0x9fb4c8;

/**
 * Plans and marks drawn over the ship, and the selected tool at work: the grid around the pointer,
 * fading out, and a ghost along the drag, coloured by what the sim would say, with its reason by the
 * pointer. A release sends the commands. With no tool out, no grid: space stays space.
 */
export const buildingFeature: Feature = {
  id: 'building',
  Panel: Toolbar,
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
    });
    const view = new Container();
    view.addChild(near, plansView, ghost, reason);

    let drawn = '';
    let pressed: Spot | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') selected.set(undefined);
    };
    window.addEventListener('keydown', onKey);

    return {
      view,
      update({ game, camera }) {
        const sim = game.client.sim;
        const q = { grid: sim.query(grid), building: sim.query(building) };
        const size = q.grid.size();

        const plans = q.building.plans();
        // Ids alone would miss a load that brings other plans under the same ids.
        // Progress is in the key, so bars grow as work goes on.
        const key = plans.map(
          (p) => `${p.id}:${p.cell}:${'place' in p ? p.place.kind : p.clear}:${p.progress}`,
        );
        if (key.join() !== drawn) {
          drawn = key.join();
          drawPlans(plansView, plans, size.width, q);
        }

        const tool = selected.get();
        for (const button of camera.takeLeft()) {
          if (!tool) continue;
          const next = onButton(pressed, button, size);
          pressed = next.pressed;
          if (!next.line) continue;
          for (const verdict of judge(tool, lineOf(size.width, tool, ...next.line), q)) {
            for (const c of verdict.commands) game.client.send(c);
          }
        }
        if (!tool) pressed = undefined;

        ghost.clear();
        near.clear();
        reason.text = '';
        const pointer = camera.pointer();
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
        window.removeEventListener('keydown', onKey);
        // The tool belongs to this game's world; a new one starts with none.
        selected.set(undefined);
      },
    };
  },
};

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
 * along the bottom of each plan with work done on it.
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
    } else {
      g.rect(x + 2, y + 2, w - 4, h - 4)
        .fill({ color: PLAN, alpha: p.place.layer === 'machine' ? 0.15 : 0.25 })
        .stroke({ width: p.place.layer === 'machine' ? 2 : 1, color: PLAN });
    }
    const ticks = q.building.ticksFor(p.id);
    if (p.progress > 0 && ticks) {
      g.rect(x + 2, y + h - 5, w - 4, 3).fill({ color: BAR_BACK });
      g.rect(x + 2, y + h - 5, ((w - 4) * p.progress) / ticks, 3).fill({ color: BAR });
    }
  }
}
