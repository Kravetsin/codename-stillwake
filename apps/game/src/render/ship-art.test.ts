import { MACHINES, type MachineKind, type MaterialId } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { CELL } from './camera';
import { GEAR, MACHINE_ART, WALL } from './ship-art';

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

describe('wall art', () => {
  it.each(Object.keys(WALL) as MaterialId[])(
    '%s is whole cells, a row as long as the next',
    (id) => {
      const rows = WALL[id];
      const width = rows[0]?.length ?? 0;
      expect(width % CELL).toBe(0);
      expect(rows.length % CELL).toBe(0);
      for (const row of rows) expect(row).toHaveLength(width);
    },
  );
});
