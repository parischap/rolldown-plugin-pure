/**
 * Rollup/rolldown plugin that inserts `@__PURE__` annotations in `generateBundle` (after
 * minification) so they survive the minifier and enable tree-shaking.
 */

import type { Node, PropertyDefinition } from '@oxc-project/types';
import type { Plugin } from 'rolldown';

import remapping from '@jridgewell/remapping';
import MagicString from 'magic-string';
import { walk } from 'zimmerframe';

interface PluginContextLike {
  parse(code: string, options?: unknown): unknown;
}

interface SourceMapLike {
  version: number;
  mappings: string;
  names: Array<string>;
}

interface OutputChunkLike {
  readonly type: 'chunk';
  code: string;
  map: SourceMapLike | null;
}

interface OutputBundleLike {
  readonly [filename: string]: OutputChunkLike | { readonly type: string };
}

interface OutputOptionsLike {
  readonly sourcemap?: boolean | 'inline' | 'hidden';
}

/**
 * Plugin interface compatible with rollup, rolldown, tsdown, and vite — use as return type to avoid
 * casting when passing this plugin to any of these bundlers.
 *
 * @category Models
 */
export interface BundlerPlugin {
  readonly name: string;
  generateBundle(
    this: PluginContextLike,
    outputOptions: OutputOptionsLike,
    bundle: OutputBundleLike,
  ): void;
}

/**
 * Returns a rollup/rolldown/tsdown/vite plugin that inserts `@__PURE__` annotations after
 * minification so they are not stripped by the minifier.
 *
 * @category Constructors
 */
export default (): BundlerPlugin => {
  const plugin: Plugin = {
    name: 'rollup-plugin-pure',
    generateBundle(outputOptions, bundle) {
      Object.entries(bundle).forEach(([filename, chunk]) => {
        if (chunk.type !== 'chunk') return;

        const { code } = chunk;

        const annotatedCode = new MagicString(code);

        walk(this.parse(code) as Node, null, {
          ArrowFunctionExpression: () => {},
          FunctionDeclaration: () => {},
          FunctionExpression: () => {},
          MethodDefinition: () => {},
          ForInStatement: () => {},
          ForOfStatement: () => {},
          ForStatement: () => {},
          WhileStatement: () => {},
          ThrowStatement: () => {},
          UpdateExpression: () => {},
          PropertyDefinition: (node: PropertyDefinition, { next }) => {
            if (!node.static) return;
            next();
          },
          CallExpression: (node, { visit }) => {
            annotatedCode.appendLeft(node.start, '/*@__PURE__*/');
            node.arguments.forEach((arg) => visit(arg));
          },
          NewExpression: (node, { visit }) => {
            annotatedCode.appendLeft(node.start, '/*@__PURE__*/');
            node.arguments.forEach((arg) => visit(arg));
          },
          AssignmentExpression: (node, { visit }) => {
            visit(node.right);
          },
          MemberExpression: (node) => {
            annotatedCode
              .appendLeft(node.start, '/*@__PURE__*/(()=>(')
              .appendLeft(node.end, '))()');
          },
          ObjectExpression: (node, { next }) => {
            if (node.properties.some((p) => p.type === 'SpreadElement'))
              annotatedCode
                .appendLeft(node.start, '/*@__PURE__*/(()=>(')
                .appendLeft(node.end, '))()');
            next();
          },
          ArrayExpression: (node, { next }) => {
            if (node.elements.some((e) => e?.type === 'SpreadElement'))
              annotatedCode
                .appendLeft(node.start, '/*@__PURE__*/(()=>(')
                .appendLeft(node.end, '))()');
            next();
          },
        });

        if (!annotatedCode.hasChanged()) return;

        chunk.code = annotatedCode.toString();

        if (outputOptions.sourcemap === false || chunk.map === null) return;
        const { map } = chunk;
        if (map.version !== 3)
          throw new Error(`Map generated for file '${filename}' should be in version 3`);
        const chunkMapWithStringVersion = Object.assign({}, map, { version: '3' });

        const annotatedMap = annotatedCode.generateMap({ hires: true, source: filename });
        if (annotatedMap.version !== 3)
          throw new Error(`Annotated map generated for file '${filename}' should be in version 3`);
        const annotatedMapWithStringVersion = Object.assign({}, annotatedMap, { version: '3' });
        const newmap = remapping(annotatedMapWithStringVersion, (source) =>
          source === filename ? chunkMapWithStringVersion : null,
        );

        if (typeof newmap.mappings !== 'string')
          throw new Error(
            `Map generated for file '${filename}' should have mappings of type 'string'`,
          );
        chunk.map.mappings = newmap.mappings;

        chunk.map.names = newmap.names;
      });
    },
  };
  return plugin as unknown as BundlerPlugin;
};
