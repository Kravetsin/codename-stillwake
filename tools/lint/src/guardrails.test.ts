import { ESLint } from 'eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

// The guardrails are syntactic, so type information is switched off: snippets need no tsconfig.
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfig: [tseslint.configs.disableTypeChecked],
});

const GUARDRAILS = [
  'no-restricted-imports',
  'no-restricted-globals',
  'no-restricted-properties',
  'no-restricted-syntax',
  'stillwake/isolated-units',
];

async function guardrailsHit(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, file) });
  const fatal = result?.messages.find((m) => m.fatal);
  if (fatal) throw new Error(`${file}: ${fatal.message}`);
  return (result?.messages ?? [])
    .map((m) => m.ruleId ?? '')
    .filter((id) => GUARDRAILS.includes(id));
}

const SIM = 'packages/sim/src/world.ts';
const CONTENT = 'packages/content/src/materials.ts';
const AIR = 'packages/sim/src/modules/atmosphere/systems.ts';

describe('determinism bans in sim and content', () => {
  it.each([
    ['Math.random', SIM, 'Math.random();', 'no-restricted-properties'],
    [
      'Math.random in content',
      CONTENT,
      'export const x = Math.random();',
      'no-restricted-properties',
    ],
    ['Math.random by computed access', SIM, "Math['random']();", 'no-restricted-properties'],
    [
      'Math.random by destructuring',
      SIM,
      'const { random } = Math; random();',
      'no-restricted-properties',
    ],
    ['Math.sin', SIM, 'Math.sin(1);', 'no-restricted-properties'],
    ['Math.pow', SIM, 'Math.pow(2, 3);', 'no-restricted-properties'],
    ['**', SIM, 'export const x = 2 ** 3;', 'no-restricted-syntax'],
    ['**=', SIM, 'let x = 2; x **= 3;', 'no-restricted-syntax'],
    ['Date', SIM, 'Date.now();', 'no-restricted-globals'],
    ['performance', SIM, 'performance.now();', 'no-restricted-globals'],
    ['setTimeout', SIM, 'setTimeout(() => 0, 1);', 'no-restricted-globals'],
    ['queueMicrotask', SIM, 'queueMicrotask(() => 0);', 'no-restricted-globals'],
    ['Intl', SIM, 'new Intl.NumberFormat();', 'no-restricted-globals'],
    ['Promise', SIM, 'Promise.resolve(1);', 'no-restricted-globals'],
    ['async function', SIM, 'export async function f() {}', 'no-restricted-syntax'],
    ['async arrow', SIM, 'export const f = async () => 1;', 'no-restricted-syntax'],
    ['localeCompare', SIM, "'a'.localeCompare('b');", 'no-restricted-properties'],
    ['toLocaleString', SIM, '(1).toLocaleString();', 'no-restricted-properties'],
  ])('rejects %s', async (_name, file, code, rule) => {
    expect(await guardrailsHit(file, code)).toContain(rule);
  });

  it('allows plain arithmetic, Math.imul and Math.sqrt', async () => {
    const code = 'export const x = Math.imul(3, 4) + Math.floor(7 / 2) + Math.sqrt(16);';
    expect(await guardrailsHit(SIM, code)).toEqual([]);
  });

  it('leaves the game app free to use time', async () => {
    expect(await guardrailsHit('apps/game/src/clock.ts', 'export const t = Date.now();')).toEqual(
      [],
    );
  });
});

describe('package direction', () => {
  it.each([
    ['content importing sim', CONTENT, "import { a } from '@stillwake/sim'; a;"],
    ['content importing a library', CONTENT, "import { a } from 'some-lib'; a;"],
    ['sim importing net', SIM, "import { a } from '@stillwake/net'; a;"],
    ['sim importing a Node builtin', SIM, "import fs from 'node:fs'; fs;"],
    ['sim importing pixi', SIM, "import { Sprite } from 'pixi.js'; Sprite;"],
    [
      'net importing the game',
      'packages/net/src/host.ts',
      "import { a } from '@stillwake/game'; a;",
    ],
    [
      'a deep import',
      'packages/net/src/host.ts',
      "import { a } from '@stillwake/sim/src/core'; a;",
    ],
    [
      'a package by relative path',
      'apps/game/src/main.ts',
      "import { a } from '../../../packages/sim/src'; a;",
    ],
  ])('rejects %s', async (_name, file, code) => {
    expect(await guardrailsHit(file, code)).toContain('no-restricted-imports');
  });

  it.each([
    ['sim importing content', SIM, "import { a } from '@stillwake/content'; a;"],
    [
      'sim tests importing vitest',
      'packages/sim/src/world.test.ts',
      "import { it } from 'vitest'; it;",
    ],
    ['net importing sim', 'packages/net/src/host.ts', "import { a } from '@stillwake/sim'; a;"],
    ['the game importing net', 'apps/game/src/main.ts', "import { a } from '@stillwake/net'; a;"],
  ])('allows %s', async (_name, file, code) => {
    expect(await guardrailsHit(file, code)).toEqual([]);
  });
});

describe('sim modules stay apart', () => {
  it.each([
    ['a value from another module', "import { rooms } from '../rooms'; rooms;"],
    ['a type from another module’s internals', "import type { RoomsState } from '../rooms/state';"],
    [
      'an inline type import, which still loads the module',
      "import { type Rooms } from '../rooms';",
    ],
    ['a re-export from another module', "export { rooms } from '../rooms';"],
  ])('rejects %s', async (_name, code) => {
    expect(await guardrailsHit(AIR, code)).toContain('stillwake/isolated-units');
  });

  it.each([
    ['import type from the index folder', "import type { Rooms } from '../rooms';"],
    ['import type from index explicitly', "import type { Rooms } from '../rooms/index';"],
    ['its own files', "import { state } from './state'; state;"],
  ])('allows %s', async (_name, code) => {
    expect(await guardrailsHit(AIR, code)).toEqual([]);
  });

  it('leaves the module registry outside any module free to import them', async () => {
    const code = "import { atmosphere } from './atmosphere'; atmosphere;";
    expect(await guardrailsHit('packages/sim/src/modules/index.ts', code)).toEqual([]);
  });
});

describe('client features stay apart', () => {
  const OVERLAY = 'apps/game/src/features/atmosphere/overlay.ts';

  it('rejects a feature importing another feature, even as types', async () => {
    expect(
      await guardrailsHit(OVERLAY, "import { tool } from '../building/tool'; tool;"),
    ).toContain('stillwake/isolated-units');
    expect(await guardrailsHit(OVERLAY, "import type { Tool } from '../building';")).toContain(
      'stillwake/isolated-units',
    );
  });

  it('allows a feature to use the sim and its own files', async () => {
    const code = "import { a } from '@stillwake/sim'; import { b } from './layer'; a; b;";
    expect(await guardrailsHit(OVERLAY, code)).toEqual([]);
  });
});
