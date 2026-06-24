import { rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from 'rolldown';
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

  it('inserts /*@__PURE__*/ annotations after minification', async () => {
    const result = await build({
      input: inputPath,
      write: false,
      output: { minify: true, format: 'esm' },
      plugins: [purePlugin()],
    });

    expect(result.output[0].code).toContain('/*@__PURE__*/');
  });

  it('does not insert annotations without the plugin', async () => {
    const result = await build({
      input: inputPath,
      write: false,
      output: { minify: true, format: 'esm' },
    });

    expect(result.output[0].code).not.toContain('/*@__PURE__*/');
  });
});
