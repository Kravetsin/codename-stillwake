// `pnpm new:module <name> [--client]`: writes a sim module of the shape in decision 0004 and
// registers it; with --client, also the matching client feature.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const client = args.includes('--client');
const name = args.find((a) => !a.startsWith('--')) ?? '';
const RESERVED = new Set(['core', 'testing', 'index', 'feature', 'backdrop', 'dev-panel']);

if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name) || RESERVED.has(name)) {
  fail(
    `Usage: pnpm new:module <name> [--client], with <name> in kebab-case (e.g. life-support), not ${[...RESERVED].join(', ')}.`,
  );
}

const root = path.resolve(import.meta.dirname, '../..');
const modules = path.join(root, 'packages/sim/src/modules');
const dir = path.join(modules, name);
const features = path.join(root, 'apps/game/src/features');
const featureDir = path.join(features, name);
if (existsSync(dir)) fail(`packages/sim/src/modules/${name} already exists.`);
if (client && existsSync(featureDir)) fail(`apps/game/src/features/${name} already exists.`);

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

if (client) {
  mkdirSync(featureDir);
  const feature = [
    "import type { Feature } from '../feature';",
    '',
    `/** What the ${id} module shows and offers: a \`layer\` draws into the world, a \`Panel\` adds UI. */`,
    `export const ${id}Feature: Feature = { id: '${name}' };`,
    '',
  ];
  writeFileSync(path.join(featureDir, 'index.ts'), feature.join('\n'));
  registerFeature();
  console.log(`Created apps/game/src/features/${name}/ and added it to FEATURES.`);
}

console.log('Next: write its README, then replace the example state and command.');

function register() {
  const file = path.join(modules, 'index.ts');
  let text = withImport(file, '// `pnpm new:module` adds', `import { ${id} } from './${name}';`);
  text = appendTo(text, 'MODULES: readonly AnyModule[]', id);
  writeFileSync(file, `${text}export { ${id} };\n`);
}

function registerFeature() {
  const file = path.join(features, 'index.ts');
  const marker = '// `pnpm new:module <name> --client` adds';
  let text = withImport(file, marker, `import { ${id}Feature } from './${name}';`);
  // The dev panel stays last, so it draws over every other panel.
  text = appendTo(text, 'FEATURES: readonly Feature[]', `${id}Feature`, 'devPanel');
  writeFileSync(file, text);
}

/** The file's text with `line` added right after the line holding `marker`. */
function withImport(file, marker, line) {
  const text = readFileSync(file, 'utf8');
  const at = text.indexOf(marker);
  if (at < 0) fail(`Cannot find the registration marker in ${path.relative(root, file)}.`);
  const end = text.indexOf('\n', at) + 1;
  return `${text.slice(0, end)}${line}\n${text.slice(end)}`;
}

/** Adds `item` to the array declared as `export const <declaration> = [...]`, before `last`. */
function appendTo(text, declaration, item, last) {
  const head = `export const ${declaration} = [`;
  const start = text.indexOf(head);
  const end = text.indexOf('];', start);
  if (start < 0 || end < 0) fail(`Cannot find '${head}' to register '${item}'.`);
  const list = split(text.slice(start + head.length, end));
  const at = last && list.includes(last) ? list.indexOf(last) : list.length;
  list.splice(at, 0, item);
  return `${text.slice(0, start)}${head}${list.join(', ')}${text.slice(end)}`;
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
