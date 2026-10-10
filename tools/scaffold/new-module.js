// `pnpm new:module <name>`: writes a sim module of the shape in decision 0004 and registers it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const name = process.argv[2] ?? '';
const RESERVED = new Set(['core', 'testing', 'index']);

if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name) || RESERVED.has(name)) {
  fail(
    `Usage: pnpm new:module <name>, with <name> in kebab-case (e.g. life-support), not ${[...RESERVED].join(', ')}.`,
  );
}

const root = path.resolve(import.meta.dirname, '../..');
const modules = path.join(root, 'packages/sim/src/modules');
const dir = path.join(modules, name);
if (existsSync(dir)) fail(`packages/sim/src/modules/${name} already exists.`);

const id = name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const Type = id[0].toUpperCase() + id.slice(1);

const files = {
  'index.ts': `import { defineModule, refuse, withFuzz } from '../../core/module';
import { fuzz${Type} } from './fuzz';

export interface ${Type}State {
  count: number;
}

// Scaffolded example: replace the count and the bump command with the module's real state and
// commands, and keep README.md, fuzz.ts and the tests in step.
const ${id}Module = defineModule()({
  id: '${id}',
  dependsOn: [],
  init: (): ${Type}State => ({ count: 0 }),
  queries: {
    count: (ctx) => ctx.state.count,
  },
  commands: {
    bump: {
      validate(_ctx, p: { by: number }) {
        if (!Number.isSafeInteger(p.by) || p.by < 1) return refuse('${id}.badBump');
      },
      apply(ctx, p: { by: number }) {
        ctx.state.count += p.by;
      },
    },
  },
});

export const ${id} = withFuzz(${id}Module, fuzz${Type});
`,
  'fuzz.ts': `import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { ${Type}State } from './index';

/** Draws one of the module's commands for the desync test, refused ones included. */
export function fuzz${Type}(_state: DeepReadonly<${Type}State>, rng: Rng) {
  return { type: 'bump', payload: { by: rng.below(4) } } as const;
}
`,
  [`${name}.test.ts`]: `import { describe, expect, it } from 'vitest';
import { defineSim } from '../../core/sim';
import { scenario } from '../../testing/scenario';
import { ${id} } from './index';

const world = defineSim([${id}]);

describe('${id}', () => {
  it('bumps the count', () => {
    const w = scenario(world).do(${id}, 'bump', { by: 2 }).run();
    expect(w.query(${id}).count()).toBe(2);
  });

  it('refuses a bump that is not a positive whole number', () => {
    const w = scenario(world).do(${id}, 'bump', { by: 0 }).run();
    expect(w.refusals).toEqual(['${id}.badBump']);
    expect(w.query(${id}).count()).toBe(0);
  });
});
`,
  'README.md': `# ${id}

What this module owns, in one or two sentences.

- **Depends on:** nothing.
- **State:** \`count\`.
- **Commands:** \`bump\` — refused with \`${id}.badBump\` unless \`by\` is a positive whole number.
- **Queries:** \`count\`.
- **Invariants:** \`count\` never goes down.
`,
};

mkdirSync(dir);
for (const [file, text] of Object.entries(files)) writeFileSync(path.join(dir, file), text);
register();

console.log(`Created packages/sim/src/modules/${name}/ and registered '${id}' in MODULES.`);
console.log('Next: write its README, then replace the example state and command.');

function register() {
  const file = path.join(modules, 'index.ts');
  const marker = '// `pnpm new:module` adds';
  let text = readFileSync(file, 'utf8');
  const markerEnd = text.indexOf('\n', text.indexOf(marker)) + 1;
  if (markerEnd === 0) fail('Cannot find the registration marker in modules/index.ts.');
  text = `${text.slice(0, markerEnd)}import { ${id} } from './${name}';\n${text.slice(markerEnd)}`;
  text = text.replace(
    /export const MODULES: readonly AnyModule\[\] = \[([^\]]*)\];/,
    (_, list) =>
      `export const MODULES: readonly AnyModule[] = [${[...split(list), id].join(', ')}];`,
  );
  text += `export { ${id} };\n`;
  writeFileSync(file, text);
}

function split(list) {
  return list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
