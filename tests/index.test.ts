import { rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as TestUtils from '@parischap/configs/TestUtils';

import type { OutputChunk, RollupOutput } from 'rollup';

import { build as rolldownBuild } from 'rolldown';
import { rollup } from 'rollup';
import { build as tsdownBuild } from 'tsdown';
import { build as viteBuild } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import purePlugin from '../esm/index.js';

// Simple class with static fields and a constructor call - classic tree-shaking scenario
const INPUT_SOURCE = `class Foo {
  static label = 'foo';
  bar() { return this.constructor.name; }
}
export const foo = new Foo();
export const label = Foo.label;
`;

describe('rollup-plugin-pure', () => {
  let inputPath: string;
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'rpp-test-'));
    inputPath = join(dir, 'input.js');
    writeFileSync(inputPath, INPUT_SOURCE);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('with rolldown', () => {
    it('inserts /*@__PURE__*/ annotations after minification', async () => {
      const result = await rolldownBuild({
        input: inputPath,
        write: false,
        output: { minify: true, format: 'esm' },
        plugins: [purePlugin()],
      });

      expect(result.output[0].code).toContain('/*@__PURE__*/');
    });

    it('does not insert annotations without the plugin', async () => {
      const result = await rolldownBuild({
        input: inputPath,
        write: false,
        output: { minify: true, format: 'esm' },
      });

      expect(result.output[0].code).not.toContain('/*@__PURE__*/');
    });
  });

  describe('with rollup', () => {
    it('inserts /*@__PURE__*/ annotations', async () => {
      const bundle = await rollup({
        input: inputPath,
        plugins: [purePlugin()],
        onwarn: () => {},
      });
      const { output } = await bundle.generate({ format: 'es' });
      const chunk = output.find((o): o is OutputChunk => o.type === 'chunk');
      expect(chunk?.code).toContain('/*@__PURE__*/');
    });

    it('does not insert annotations without the plugin', async () => {
      const bundle = await rollup({ input: inputPath, onwarn: () => {} });
      const { output } = await bundle.generate({ format: 'es' });
      const chunk = output.find((o): o is OutputChunk => o.type === 'chunk');
      expect(chunk?.code).not.toContain('/*@__PURE__*/');
    });
  });

  describe('with tsdown', () => {
    it('inserts /*@__PURE__*/ annotations', async () => {
      const [bundle] = await tsdownBuild({
        entry: { index: inputPath },
        format: 'esm',
        plugins: [purePlugin()],
        write: false,
        config: false,
        dts: false,
        logLevel: 'silent',
      });
      TestUtils.assertDefined(bundle);
      const chunk = bundle.chunks.find((c) => c.type === 'chunk') as { code: string } | undefined;
      expect(chunk?.code).toContain('/*@__PURE__*/');
    });

    it('does not insert annotations without the plugin', async () => {
      const [bundle] = await tsdownBuild({
        entry: { index: inputPath },
        format: 'esm',
        write: false,
        config: false,
        dts: false,
        logLevel: 'silent',
      });
      TestUtils.assertDefined(bundle);
      const chunk = bundle.chunks.find((c) => c.type === 'chunk') as { code: string } | undefined;
      expect(chunk?.code).not.toContain('/*@__PURE__*/');
    });
  });

  describe('with vite', () => {
    it('inserts /*@__PURE__*/ annotations', async () => {
      const result = (await viteBuild({
        configFile: false,
        root: dir,
        build: {
          lib: { entry: 'input.js', formats: ['es'], fileName: 'output' },
          rollupOptions: { plugins: [purePlugin()] },
          write: false,
          minify: false,
        },
        logLevel: 'silent',
      })) as RollupOutput | Array<RollupOutput>;
      const outputs = Array.isArray(result) ? result : [result];
      const chunk = outputs[0]?.output.find((o): o is OutputChunk => o.type === 'chunk');
      expect(chunk?.code).toContain('/*@__PURE__*/');
    });

    it('does not insert annotations without the plugin', async () => {
      const result = (await viteBuild({
        configFile: false,
        root: dir,
        build: {
          lib: { entry: 'input.js', formats: ['es'], fileName: 'output' },
          write: false,
          minify: false,
        },
        logLevel: 'silent',
      })) as RollupOutput | Array<RollupOutput>;
      const outputs = Array.isArray(result) ? result : [result];
      const chunk = outputs[0]?.output.find((o): o is OutputChunk => o.type === 'chunk');
      expect(chunk?.code).not.toContain('/*@__PURE__*/');
    });
  });
});
