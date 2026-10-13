import { MACHINES, type MachineKind } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { CELL } from '../../render/camera';
import { GEAR, MACHINE_ART } from './art';

describe('machine art', () => {
  it.each(Object.keys(MACHINES) as MachineKind[])(
    '%s fills its footprint in known colours',
    (kind) => {
      const rows = MACHINE_ART[kind];
      expect(rows).toHaveLength(MACHINES[kind].height * CELL);
      for (const row of rows) {
        expect(row).toHaveLength(MACHINES[kind].width * CELL);
        for (const char of row) if (char !== '.') expect(GEAR).toHaveProperty(char);
      }
    },
  );
});
