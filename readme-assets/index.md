<!-- LTeX: language=en-US -->

# Table of Contents

- [In this package](#in-this-package)
- [Usage](#usage)
  - [1) Installation](#1-installation)
  - [2) Configuration](#2-configuration)
  - [3) What gets annotated](#3-what-gets-annotated)
  - [4) Sourcemap support](#4-sourcemap-support)
- [Changelog](#changelog)

# In this package

This package contains a single rollup/rolldown/tsdown plugin that inserts `/*@__PURE__*/` annotations into the bundled output, enabling tree-shakers to remove unused calls, constructors, and property accesses.

The `/*@__PURE__*/` comment, placed immediately before an expression, tells the bundler that the annotated expression is side-effect-free. When the expression's result is never used, the bundler is allowed to drop it entirely. Without these annotations, bundlers must conservatively keep every call — even if nothing imports the result.

The critical design choice is **when** the annotations are inserted. Most similar plugins run as a transform step, before minification. The minifier then sees and may strip these annotations — defeating the purpose. This plugin hooks into `generateBundle`, which runs **after** `renderChunk` (where minification takes place). The annotations are therefore written into the already-minified output and are never seen by the minifier.

```
Source → transform → renderChunk (minify) → generateBundle (← plugin runs here) → output
```

This means the plugin is fully compatible with `minify: true` and will never conflict with minification settings.

# Usage

## 1) Configuration

### rolldown

```ts
// rolldown.config.ts
import { defineConfig } from 'rolldown';
import pure from '@parischap/rolldown-plugin-pure';

export default defineConfig({
  input: 'src/index.ts',
  output: {
    format: 'esm',
    minify: true,
  },
  plugins: [pure()],
});
```

### tsdown

```ts
// tsdown.config.ts
import { defineConfig } from 'tsdown';
import pure from '@parischap/rolldown-plugin-pure';

export default defineConfig({
  entry: 'src/index.ts',
  format: 'esm',
  plugins: [pure()],
});
```

### rollup

The plugin is compatible with rollup since it only uses the standard `generateBundle` hook:

```ts
// rollup.config.ts
import { defineConfig } from 'rollup';
import pure from '@parischap/rolldown-plugin-pure';

export default defineConfig({
  input: 'src/index.ts',
  output: {
    format: 'esm',
  },
  plugins: [pure()],
});
```

### vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import pure from '@parischap/rolldown-plugin-pure';

export default defineConfig({
  plugins: [pure()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
    },
  },
});
```

## 2) What gets annotated

The plugin walks the AST of the bundled (and already minified) output and inserts `/*@__PURE__*/` before each expression that could be side-effect-free. It does **not** traverse into function or method bodies (whose code runs lazily, not at module evaluation time), loop statements, throw statements, or update expressions.

### Call expressions

```js
// Before annotation
const result = computeValue(x, y);

// After annotation
const result = /*@__PURE__*/ computeValue(x, y);
```

Call arguments that are themselves calls are annotated recursively:

```js
const result = /*@__PURE__*/ outer(/*@__PURE__*/ inner(x));
```

### Constructor calls

```js
// Before annotation
const instance = new MyClass(opts);

// After annotation
const instance = /*@__PURE__*/ new MyClass(opts);
```

### Property access (member expressions)

Reading a property can trigger a getter, which may have side effects. Member expressions are therefore wrapped in a pure IIFE:

```js
// Before annotation
const v = Foo.defaultValue;

// After annotation
const v = /*@__PURE__*/ (() => Foo.defaultValue)();
```

### Object literals with spread

Spreading an object invokes the source's iterator or getter, which may be impure. Object literals that contain spread elements are wrapped:

```js
// Before annotation
const merged = { ...defaults, ...overrides };

// After annotation
const merged = /*@__PURE__*/ (() => ({ ...defaults, ...overrides }))();
```

Plain object literals (no spread) are left as-is — they are already pure by definition.

### Array literals with spread

The same logic applies to arrays:

```js
// Before annotation
const combined = [...base, ...extras];

// After annotation
const combined = /*@__PURE__*/ (() => [...base, ...extras])();
```

## 3) Sourcemap support

When sourcemaps are enabled (`output.sourcemap !== false`), the plugin composes the annotation sourcemap with the existing chunk sourcemap using [`@jridgewell/remapping`](https://github.com/nicolo-ribaudo/node-map-generator), so that debugging in the browser or an IDE continues to point back to the original TypeScript sources. No extra configuration is needed.

# Changelog

## 0.1.2

Improved package documentation.

## 0.1.1

Improved package documentation.

## 0.1.0

First public release. Provides a single `generateBundle` plugin that annotates call expressions, constructor calls, member expressions, and spread-containing object/array literals with `/*@__PURE__*/` after minification. Supports sourcemap composition via `@jridgewell/remapping`.
