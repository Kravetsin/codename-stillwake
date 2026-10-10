import { existsSync } from 'node:fs';
import path from 'node:path';

const FILE_EXTENSIONS = ['.ts', '.tsx', '.js'];

/**
 * Each folder directly under `root` is a unit (a sim module, a client feature). A file inside one
 * unit may not import from another; with `typeOnlyViaIndex`, `import type` from its index is allowed.
 * @type {import('eslint').Rule.RuleModule}
 */
export const isolatedUnits = {
  meta: {
    type: 'problem',
    docs: { description: 'Forbid imports between sibling units such as sim modules.' },
    schema: [
      {
        type: 'object',
        properties: { root: { type: 'string' }, typeOnlyViaIndex: { type: 'boolean' } },
        required: ['root'],
        additionalProperties: false,
      },
    ],
    messages: {
      crossUnit: "'{{from}}' may not import from '{{to}}'.",
      typeOnlyViaIndex:
        "'{{from}}' may import '{{to}}' only with `import type`, and only from its index.",
    },
  },

  create(context) {
    const { root, typeOnlyViaIndex = false } = context.options[0];
    const rootDir = path.resolve(context.cwd, root);

    /** @param {string} file */
    const locate = (file) => {
      const rel = path.relative(rootDir, file);
      if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
      const [unit, ...rest] = rel.split(path.sep);
      return { unit, rest };
    };

    const self = locate(context.filename);
    // A file sitting directly in `root` (a registry, say) belongs to no unit.
    if (!self || self.rest.length === 0) return {};

    /**
     * @param {import('estree').Node} node
     * @param {unknown} source
     * @param {boolean} typeOnly
     */
    const check = (node, source, typeOnly) => {
      if (typeof source !== 'string' || !source.startsWith('.')) return;
      const resolved = path.resolve(path.dirname(context.filename), source);
      const target = locate(resolved);
      if (!target || target.unit === self.unit) return;
      // A file sitting directly in `root` (shared types, a registry) is not a unit.
      if (target.rest.length === 0 && FILE_EXTENSIONS.some((ext) => existsSync(resolved + ext)))
        return;
      const viaIndex =
        target.rest.length === 0 ||
        (target.rest.length === 1 && /^index(\.[jt]s)?$/.test(target.rest[0] ?? ''));
      if (typeOnlyViaIndex && typeOnly && viaIndex) return;
      context.report({
        node,
        messageId: typeOnlyViaIndex ? 'typeOnlyViaIndex' : 'crossUnit',
        data: { from: self.unit, to: target.unit },
      });
    };

    return {
      ImportDeclaration(node) {
        // `import { type X }` still loads the module at runtime; only `import type` is type-only.
        check(node, node.source.value, /** @type {any} */ (node).importKind === 'type');
      },
      ExportNamedDeclaration(node) {
        if (node.source)
          check(node, node.source.value, /** @type {any} */ (node).exportKind === 'type');
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value, /** @type {any} */ (node).exportKind === 'type');
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') check(node, node.source.value, false);
      },
    };
  },
};
