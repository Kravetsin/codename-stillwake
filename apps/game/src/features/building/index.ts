import { building, grid, type Plan, type QueryApi } from '@stillwake/sim';
import { Container, Graphics, Text } from 'pixi.js';
import { t } from '../../i18n/en';
import { CELL } from '../../render/camera';
import type { Feature } from '../feature';
import { judge, lineOf, onButton, onGrid, spotAt, type Spot } from './drag';
import { Toolbar } from './Toolbar';
import { selected } from './tools';

const PLAN = 0x5fd0ff;
const MARK = 0xe05555;
const FITS = 0x7fe08a;
const REFUSED = 0xe05555;

/**
 * Plans and marks drawn over the ship, and the selected tool at work: a ghost along the drag,
 * coloured by what the sim would say, with its reason by the pointer. A release sends the commands.
 */
export const buildingFeature: Feature = {
  id: 'building',
  Panel: Toolbar,
  layer() {
    const plansView = new Graphics();
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
    view.addChild(plansView, ghost, reason);

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
        const key = plans.map((p) => `${p.id}:${p.cell}:${'place' in p ? p.place.kind : p.clear}`);
        if (key.join() !== drawn) {
          drawn = key.join();
          drawPlans(plansView, plans, size.width, q.grid);
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
        reason.text = '';
        const pointer = camera.pointer();
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

/** Plans as translucent shapes by layer; marks as red crosses over what they take out. */
function drawPlans(
  g: Graphics,
  plans: readonly Plan[],
  width: number,
  gridQuery: QueryApi<typeof grid>,
) {
  g.clear();
  for (const p of plans) {
    if ('clear' in p) {
      const machine = p.clear === 'machine' ? gridQuery.machineAt(p.cell) : undefined;
      const cells = machine
        ? (gridQuery.footprint(machine.kind, machine.cell) ?? [p.cell])
        : [p.cell];
      const { x, y, w, h } = boxOf(cells, width);
      g.moveTo(x + 4, y + 4)
        .lineTo(x + w - 4, y + h - 4)
        .moveTo(x + w - 4, y + 4)
        .lineTo(x + 4, y + h - 4)
        .stroke({ width: 2, color: MARK });
      continue;
    }
    const cells =
      p.place.layer === 'machine'
        ? (gridQuery.footprint(p.place.kind, p.cell) ?? [p.cell])
        : [p.cell];
    const { x, y, w, h } = boxOf(cells, width);
    switch (p.place.layer) {
      case 'structure':
        g.rect(x + 2, y + 2, w - 4, h - 4)
          .fill({ color: PLAN, alpha: 0.25 })
          .stroke({ width: 1, color: PLAN });
        break;
      case 'conduit':
        g.rect(x, y + h / 2 - 2, w, 4).fill({ color: PLAN, alpha: 0.7 });
        break;
      case 'machine':
        g.rect(x + 2, y + 2, w - 4, h - 4)
          .fill({ color: PLAN, alpha: 0.15 })
          .stroke({ width: 2, color: PLAN });
        break;
    }
  }
}
