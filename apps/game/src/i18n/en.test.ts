import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { MODULES } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { EN } from './en';

/** Every `.ts` file under `dir`, tests left out. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return sources(file);
    return file.endsWith('.ts') && !file.endsWith('.test.ts') ? [file] : [];
  });
}

// A refusal key is any quoted `<moduleId>.<why>` in a module's code, however it is handed back.
const REFUSAL = new RegExp(`'((?:${MODULES.map((m) => m.id).join('|')})\\.[a-z]\\w*)'`, 'g');

describe('english text', () => {
  it('has every refusal reason the sim can give', () => {
    const modules = path.resolve(import.meta.dirname, '../../../../packages/sim/src/modules');
    const keys = new Set(
      sources(modules).flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(REFUSAL)].map((m) => m[1] ?? ''),
      ),
    );
    // Checked against keys known to exist, so a broken pattern cannot pass by finding nothing.
    expect(keys).toContain('grid.occupied');
    expect(keys).toContain('building.noPlan');
    expect([...keys].filter((key) => !(key in EN))).toEqual([]);
  });
});
