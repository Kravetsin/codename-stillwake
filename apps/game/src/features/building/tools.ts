import { MACHINES, MATERIALS, type MachineKind, type MaterialId } from '@stillwake/content';
import type { Placement } from '@stillwake/sim';
import { t } from '../../i18n/en';
import { createStore } from '../../session/store';
import { buildMode } from '../../session/ui';

/** What the left button does in the world while a tool is selected. */
export type Tool =
  | { readonly kind: 'place'; readonly placement: Placement; readonly label: string }
  | { readonly kind: 'deconstruct' | 'cancel'; readonly label: string };

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
