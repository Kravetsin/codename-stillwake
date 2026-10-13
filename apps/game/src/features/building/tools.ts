import { CABLE_COST, MATERIALS, type MaterialId } from '@stillwake/content';
import type { Cost, Placement } from '@stillwake/sim';
import { t } from '../../i18n/en';
import { createStore } from '../../session/store';
import { buildMode, overlayOn } from '../../session/ui';

/** What the left button does in the world while a tool is selected; `id` names its text. */
export type Tool =
  | {
      readonly kind: 'place';
      readonly id: string;
      readonly placement: Placement;
      readonly label: string;
    }
  | {
      readonly kind: 'cable' | 'deconstruct' | 'cancel';
      readonly id: string;
      readonly label: string;
    };

const place = (id: string, placement: Placement, label = t(`tool.${id}`)): Tool => ({
  kind: 'place',
  id,
  placement,
  label,
});

const walls = (Object.keys(MATERIALS) as MaterialId[]).map((material) =>
  place(
    `wall${material[0]?.toUpperCase()}${material.slice(1)}`,
    { layer: 'structure', kind: 'wall', material },
    `${t('tool.wall')}: ${t(`material.${material}`)}`,
  ),
);

/** The build menu's tabs, in order, each with its tools: what the player builds, grouped by use. */
export const TABS: readonly { readonly id: string; readonly tools: readonly Tool[] }[] = [
  {
    id: 'structure',
    tools: [
      ...walls,
      place('floor', { layer: 'structure', kind: 'floor' }),
      place('ladder', { layer: 'structure', kind: 'ladder' }),
      place('door', { layer: 'structure', kind: 'door' }),
      place('backWall', { layer: 'back', kind: 'backWall' }),
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
    ],
  },
  { id: 'production', tools: [place('furnace', { layer: 'machine', kind: 'furnace' })] },
  { id: 'storage', tools: [place('crate', { layer: 'machine', kind: 'crate' })] },
];

/** Taking apart and cancelling, in the menu's header on every tab. */
export const DECONSTRUCT: Tool = {
  kind: 'deconstruct',
  id: 'deconstruct',
  label: t('tool.deconstruct'),
};
export const CANCEL: Tool = { kind: 'cancel', id: 'cancel', label: t('tool.cancel') };

/** Every tool, tab by tab, then the header's two. */
export const TOOLS: readonly Tool[] = [...TABS.flatMap((tab) => tab.tools), DECONSTRUCT, CANCEL];

/** What a tool costs, by `costFor` (the sim's own rule) for what it places; a cable's own cost. */
export function costOf(tool: Tool, costFor: (placement: Placement) => Cost): Cost {
  if (tool.kind === 'place') return costFor(tool.placement);
  return tool.kind === 'cable' ? CABLE_COST : {};
}

/**
 * The selected tool, shared by the menu that sets it and the layer that uses it. One per page:
 * there is one game and one player at this keyboard.
 */
export const selected = createStore<Tool | undefined>(undefined);
selected.subscribe(() => buildMode.set(selected.get() !== undefined));

/** The overlay a tool is used in, where what it lays is in sight: by the overlay's feature id. */
export function overlayFor(tool: Tool | undefined): string | undefined {
  if (tool?.kind === 'cable') return 'power';
  if (tool?.kind === 'place' && tool.placement.layer === 'conduit') return 'pipes';
  return undefined;
}

// A tool that needs an overlay turns it on; put away, the overlay that was on before comes back.
let before: string | undefined;
let forced: string | undefined;
selected.subscribe(() => {
  const wanted = overlayFor(selected.get());
  if (wanted === forced) return;
  if (forced === undefined) before = overlayOn.get();
  overlayOn.set(wanted ?? before);
  forced = wanted;
});
