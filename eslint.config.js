import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import stillwake from './tools/lint/src/index.js';

const TESTS = ['**/*.test.ts', '**/*.test.tsx'];

// One list per package: a later `no-restricted-imports` replaces an earlier one, so each repeats these.
const EVERYWHERE = [
  { group: ['@stillwake/*/*'], message: 'Import a package only through its public entry.' },
  { group: ['@stillwake/game'], message: 'Nothing imports the game app.' },
  {
    regex: '^(\\.\\./)+(packages|apps|tools)/',
    message: 'Import another package by its name, not by path.',
  },
];

/** @param {...object} extra */
const imports = (...extra) => ['error', { patterns: [...EVERYWHERE, ...extra] }];

/**
 * Forbids every bare specifier except `allowed`; relative imports stay open.
 * @param {string[]} allowed
 * @param {string} message
 */
const only = (allowed, message) => ({
  regex: `^(?!\\.${allowed.map((a) => `|${a.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`).join('')})`,
  message,
});

const TEST_LIBS = ['vitest', 'fast-check'];

const REAL_WORLD = [
  'Date',
  'performance',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
];
const CPU_DEPENDENT_MATH = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'hypot',
  'cbrt',
];
const LOCALE_DEPENDENT = [
  'localeCompare',
  'toLocaleString',
  'toLocaleDateString',
  'toLocaleTimeString',
  'toLocaleUpperCase',
  'toLocaleLowerCase',
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { stillwake },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      'no-restricted-imports': imports(),
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // CommonJS where a host demands it: the desktop shell's sandboxed preload.
    files: ['**/*.cjs'],
    languageOptions: { globals: globals.commonjs },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['apps/game/src/**'],
    languageOptions: { globals: globals.browser },
  },

  // Package direction: content → sim → net → game.
  {
    files: ['packages/content/**'],
    rules: { 'no-restricted-imports': imports(only([], 'content imports nothing.')) },
  },
  {
    files: TESTS.map((t) => `packages/content/${t}`),
    rules: {
      'no-restricted-imports': imports(
        only(TEST_LIBS, 'content tests import test libraries only.'),
      ),
    },
  },
  {
    files: ['packages/sim/**'],
    rules: {
      'no-restricted-imports': imports(
        only(['@stillwake/content'], 'sim imports only @stillwake/content.'),
      ),
    },
  },
  {
    files: TESTS.map((t) => `packages/sim/${t}`),
    rules: {
      'no-restricted-imports': imports(
        only(
          ['@stillwake/content', ...TEST_LIBS],
          'sim tests import content and test libraries only.',
        ),
      ),
    },
  },

  // Determinism: every peer must compute the same world (CLAUDE.md, "Determinism").
  {
    files: ['packages/sim/**/*.ts', 'packages/content/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...REAL_WORLD.map((name) => ({
          name,
          message: 'Time does not exist in the sim: use ticks.',
        })),
        { name: 'Intl', message: "Depends on the player's locale." },
        { name: 'crypto', message: 'Use the world PRNG.' },
        { name: 'Promise', message: 'No async code in the sim.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the world PRNG.' },
        ...CPU_DEPENDENT_MATH.map((property) => ({
          object: 'Math',
          property,
          message: 'May differ between CPUs: use integer math.',
        })),
        ...LOCALE_DEPENDENT.map((property) => ({
          property,
          message: "Depends on the player's locale.",
        })),
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "BinaryExpression[operator='**']", message: '`**` may differ between CPUs.' },
        {
          selector: "AssignmentExpression[operator='**=']",
          message: '`**` may differ between CPUs.',
        },
        { selector: ':function[async=true]', message: 'No async code in the sim.' },
      ],
    },
  },

  // Sim modules and client features do not reach into each other (decision 0004).
  {
    files: ['packages/sim/src/modules/**'],
    rules: {
      'stillwake/isolated-units': [
        'error',
        { root: 'packages/sim/src/modules', typeOnlyViaIndex: true },
      ],
    },
  },
  {
    files: ['apps/game/src/features/**'],
    rules: { 'stillwake/isolated-units': ['error', { root: 'apps/game/src/features' }] },
  },
);
