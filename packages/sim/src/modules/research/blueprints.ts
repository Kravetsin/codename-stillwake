import { BUILDS, MACHINES, MATERIALS, type MachineKind, type MaterialId } from '@stillwake/content';
import type { Placement } from '../grid';

const titled = (id: string) => `${id[0]?.toUpperCase() ?? ''}${id.slice(1)}`;

/** The blueprint `placement` is built by, named as the build menu names its card (`wallIron`). */
export function blueprintOf(placement: Placement): string {
  return placement.kind === 'wall' || placement.kind === 'backWall'
    ? `${placement.kind}${titled(placement.material)}`
    : placement.kind;
}

const materials = Object.keys(MATERIALS) as MaterialId[];
const builds = Object.keys(BUILDS) as (keyof typeof BUILDS)[];

/** Every blueprint there is, with what it places: walls and back walls by material, builds, machines. */
export const BLUEPRINTS: readonly { readonly id: string; readonly placement: Placement }[] = [
  ...materials.map((material) => ({ layer: 'structure', kind: 'wall', material }) as const),
  ...materials.map((material) => ({ layer: 'back', kind: 'backWall', material }) as const),
  ...builds.map((kind) =>
    kind === 'pipe' || kind === 'valve'
      ? ({ layer: 'conduit', kind } as const)
      : ({ layer: 'structure', kind } as const),
  ),
  ...(Object.keys(MACHINES) as MachineKind[]).map((kind) => ({ layer: 'machine', kind }) as const),
].map((placement: Placement) => ({ id: blueprintOf(placement), placement }));
