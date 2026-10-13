import { CABLE_COST, MATERIALS, type MaterialId } from '@stillwake/content';
import type { building, Cost, grid, Layer, Placement, power, QueryApi } from '@stillwake/sim';
import { t } from '../../i18n/en';
import { createStore } from '../../session/store';
import { hand, overlayOn } from '../../session/ui';

/** A card in hand: what the left button does in the world with it; `id` names its text. */
export type Tool =
  | {
      readonly kind: 'place';
      readonly id: string;
      readonly placement: Placement;
      readonly label: string;
    }
  | {
      readonly kind: 'cable';
      readonly id: string;
      readonly label: string;
    };

const place = (id: string, placement: Placement, label = t(`tool.${id}`)): Tool => ({
  kind: 'place',
  id,
  placement,
  label,
});

/** A tool for each material, `id` and its text's key followed by the material's name. */
const ofEveryMaterial = (id: 'wall' | 'backWall', placement: (m: MaterialId) => Placement) =>
  (Object.keys(MATERIALS) as MaterialId[]).map((material) =>
    place(
      `${id}${material[0]?.toUpperCase()}${material.slice(1)}`,
      placement(material),
      `${t(`tool.${id}`)}: ${t(`material.${material}`)}`,
    ),
  );

/** The build menu's tabs, in order, each with its tools: what the player builds, grouped by use. */
export const TABS: readonly { readonly id: string; readonly tools: readonly Tool[] }[] = [
  {
    id: 'structure',
    tools: [
      ...ofEveryMaterial('wall', (material) => ({ layer: 'structure', kind: 'wall', material })),
      ...ofEveryMaterial('backWall', (material) => ({ layer: 'back', kind: 'backWall', material })),
      place('floor', { layer: 'structure', kind: 'floor' }),
      place('ladder', { layer: 'structure', kind: 'ladder' }),
      place('door', { layer: 'structure', kind: 'door' }),
    ],
  },
  {
    id: 'air',
    tools: [
      place('pipe', { layer: 'conduit', kind: 'pipe' }),
      place('valve', { layer: 'conduit', kind: 'valve' }),
      place('vent', { layer: 'machine', kind: 'vent' }),
      place('tank', { layer: 'machine', kind: 'tank' }),
      place('generator', { layer: 'machine', kind: 'generator' }),
    ],
  },
  {
    id: 'power',
    tools: [
      { kind: 'cable', id: 'cable', label: t('tool.cable') },
      place('solarPanel', { layer: 'machine', kind: 'solarPanel' }),
      place('lamp', { layer: 'machine', kind: 'lamp' }),
    ],
  },
  { id: 'production', tools: [place('furnace', { layer: 'machine', kind: 'furnace' })] },
  { id: 'storage', tools: [place('crate', { layer: 'machine', kind: 'crate' })] },
];

/** Every card, tab by tab. */
export const TOOLS: readonly Tool[] = TABS.flatMap((tab) => tab.tools);

/** What a card costs, by `costFor` (the sim's own rule) for what it places; a cable its own. */
export function costOf(tool: Tool, costFor: (placement: Placement) => Cost): Cost {
  return tool.kind === 'place' ? costFor(tool.placement) : CABLE_COST;
}

/**
 * The card in hand, shared by the menu that sets it and the layer that uses it. One per page: there
 * is one game and one player at this keyboard.
 */
export const selected = createStore<Tool | undefined>(undefined);

/** Whether the build menu is open: B opens and closes it. */
export const menuOpen = createStore(false);

/** Puts the plan away: the menu closes and the card goes with it. */
export function putPlanAway(): void {
  menuOpen.set(false);
  selected.set(undefined);
}

// The hand holds the cable, the plan while the menu is open or a card is out, or neither; freed
// from elsewhere — a hotbar slot picked — it puts the plan away.
const holding = () =>
  selected.get()?.kind === 'cable'
    ? 'cable'
    : menuOpen.get() || selected.get() !== undefined
      ? 'plan'
      : 'free';
selected.subscribe(() => hand.set(holding()));
menuOpen.subscribe(() => hand.set(holding()));
hand.subscribe(() => {
  if (hand.get() === 'free' && holding() !== 'free') putPlanAway();
});

/** The overlays by their features' ids. */
export const POWER = 'power';
const PIPES = 'pipes';
const AIR = 'atmosphere';

/** The overlay a card is used in, where what it lays is in sight: by the overlay's feature id. */
export function overlayFor(tool: Tool | undefined): string | undefined {
  if (tool?.kind === 'cable') return POWER;
  if (tool?.kind === 'place' && tool.placement.layer === 'conduit') return PIPES;
  return undefined;
}

// A card that needs an overlay turns it on; put away, the overlay that was on before comes back.
let before: string | undefined;
let forced: string | undefined;
selected.subscribe(() => {
  const wanted = overlayFor(selected.get());
  if (wanted === forced) return;
  if (forced === undefined) before = overlayOn.get();
  forced = wanted;
  overlayOn.set(wanted ?? before);
});
// The cable is laid in the power overlay: another overlay, or none, puts it away and stays.
overlayOn.subscribe(() => {
  if (selected.get()?.kind !== 'cable' || overlayOn.get() === POWER) return;
  forced = undefined;
  selected.set(undefined);
});

/** The menu's tab an overlay opens it on: what is built in what it shows. */
export function tabFor(overlay: string | undefined): string | undefined {
  if (overlay === POWER) return 'power';
  if (overlay === PIPES || overlay === AIR) return 'air';
  return undefined;
}

/**
 * The layers the right button removes from and the middle one picks in, under `overlay`, in the
 * order they are taken: pipes and valves under the pipes overlay, else what the ship is built of.
 * Cables, under the power overlay, are the power feature's.
 */
export function layersFor(overlay: string | undefined): readonly Layer[] {
  return overlay === PIPES ? ['conduit'] : ['machine', 'structure', 'back'];
}

interface Queries {
  readonly grid: QueryApi<typeof grid>;
  readonly building: QueryApi<typeof building>;
  readonly power: QueryApi<typeof power>;
}

/** What is placed at `cell` in `layers`: a plan first, then what is built, in their order. */
function placementAt(cell: number, layers: readonly Layer[], q: Queries): Placement | undefined {
  for (const plan of q.building.plansAt(cell)) {
    if ('place' in plan && layers.includes(plan.place.layer)) return plan.place;
  }
  for (const layer of layers) {
    if (layer === 'machine') {
      const m = q.grid.machineAt(cell);
      if (m) return { layer, kind: m.kind };
    } else if (layer === 'conduit') {
      const c = q.grid.conduitAt(cell);
      if (c.kind !== 'none') return { layer, kind: c.kind };
    } else if (layer === 'structure') {
      const s = q.grid.structureAt(cell);
      if (s.kind === 'wall') return { layer, kind: 'wall', material: s.material };
      if (s.kind !== 'empty') return { layer, kind: s.kind };
    } else {
      const material = q.grid.backAt(cell);
      if (material) return { layer, kind: 'backWall', material };
    }
  }
  return undefined;
}

const materialOf = (p: Placement) => ('material' in p ? p.material : undefined);

/**
 * The pipette's card for `cell` under `overlay`: under the power overlay the cable, on a node a
 * cable ends at; else the card that places what is there, planned or built, in `layersFor`.
 */
export function cardAt(cell: number, overlay: string | undefined, q: Queries): Tool | undefined {
  if (overlay === POWER) {
    const node = q.power.nodeAt(cell);
    const cabled = node !== undefined && q.power.cabled(node);
    return cabled ? TOOLS.find((each) => each.kind === 'cable') : undefined;
  }
  const placed = placementAt(cell, layersFor(overlay), q);
  if (!placed) return undefined;
  return TOOLS.find(
    (each) =>
      each.kind === 'place' &&
      each.placement.layer === placed.layer &&
      each.placement.kind === placed.kind &&
      materialOf(each.placement) === materialOf(placed),
  );
}
