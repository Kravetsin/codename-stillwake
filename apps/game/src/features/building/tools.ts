import { MACHINES, MATERIALS, type MachineKind, type MaterialId } from '@stillwake/content';
import type { Placement } from '@stillwake/sim';
import { t } from '../../i18n/en';
import { createStore } from '../../session/store';
import { buildMode, overlayOn } from '../../session/ui';

/** What the left button does in the world while a tool is selected. */
export type Tool =
  | { readonly kind: 'place'; readonly placement: Placement; readonly label: string }
  | { readonly kind: 'cable' | 'deconstruct' | 'cancel'; readonly label: string };

const place = (placement: Placement, label: string): Tool => ({ kind: 'place', placement, label });

/** The toolbar, left to right. */
export const TOOLS: readonly Tool[] = [
  ...(Object.keys(MATERIALS) as MaterialId[]).map((material) =>
    place(
      { layer: 'structure', kind: 'wall', material },
      `${t('tool.wall')}: ${t(`material.${material}`)}`,
    ),
  ),
  ...(['floor', 'ladder', 'door'] as const).map((kind) =>
    place({ layer: 'structure', kind }, t(`tool.${kind}`)),
  ),
  place({ layer: 'back', kind: 'backWall' }, t('tool.backWall')),
  ...(['pipe', 'valve'] as const).map((kind) =>
    place({ layer: 'conduit', kind }, t(`tool.${kind}`)),
  ),
  { kind: 'cable', label: t('tool.cable') },
  ...(Object.keys(MACHINES) as MachineKind[]).map((kind) =>
    place({ layer: 'machine', kind }, t(`tool.${kind}`)),
  ),
  { kind: 'deconstruct', label: t('tool.deconstruct') },
  { kind: 'cancel', label: t('tool.cancel') },
];

/**
 * The selected tool, shared by the toolbar that sets it and the layer that uses it. One per page:
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
