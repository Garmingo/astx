# @astx/compiler

Compiles JavaScript source code to the ASTX binary format. Part of the [ASTX monorepo](../../README.md).

---

## Installation

```bash
npm install @astx/compiler
```

---

## API

### `compile(code, skipTransformers?, opts?)`

Parses and optimises JavaScript source code, returns a `CompiledProgram`.

```ts
import { compile } from "@astx/compiler";

const program = compile(`
  const result = 2 ** 10;
  console.log(result);
`);
```

**Options (`CompileOptions`):**

| Option | Type | Default | Description |
|---|---|---|---|
| `sourceMap` | `boolean` | `false` | Attach `[line, col]` info to every bytecode slot |
| `verbose` | `boolean` | `false` | Print transformer activity to the logger |
| `logger` | `CompileLogger` | `console` | Custom logger – implement `{ log, warn }` to redirect output |

`skipTransformers` is an optional array of transformer names to disable for this compilation.

**Controlling log output:**

By default all `[ASTX-Compiler]` output is suppressed (`verbose: false`). Enable it or route it to your own logging system:

```ts
// Enable built-in console output
const program = compile(source, [], { verbose: true });

// Redirect to a custom logger (e.g. pino, winston, a test spy)
const program = compile(source, [], {
  verbose: true,
  logger: {
    log: (...args) => myLogger.debug(args.join(" ")),
    warn: (...args) => myLogger.warn(args.join(" ")),
  },
});
```

> `.warn()` is always forwarded regardless of `verbose` so transformer errors are never silently swallowed.

---

### `toBuffer(program, opts?): Promise<Uint8Array>`

Serialises a `CompiledProgram` to the compressed ASTX binary format.

```ts
import { compile, toBuffer } from "@astx/compiler";

const program = compile(source);
const bytes = await toBuffer(program);
```

**Options (`ToBufferOptions`):**

| Option | Type | Default | Description |
|---|---|---|---|
| `codec` | `AstxCodec` | Node.js built-in zstd | Custom compress/decompress implementation |
| `level` | `number` | `22` | Zstd compression level (1–22) |
| `dict` | `Uint8Array` | — | Pre-trained Zstd dictionary (requires custom codec) |

---

### `saveToFile(program, filename, opts?): Promise<void>`

Convenience wrapper: serialises and writes the binary to disk. **Node.js only.**

```ts
import { compile, saveToFile } from "@astx/compiler";

const program = compile(source);
await saveToFile(program, "output.astx");
```

---

## Browser support

All APIs are browser-compatible. The default codec uses `node:zlib` via a dynamic import — in a browser you must supply a custom `AstxCodec`:

```ts
import { compress, decompress } from "@mongodb-js/zstd"; // WASM-backed
import { compile, toBuffer } from "@astx/compiler";

const program = compile(source);
const bytes = await toBuffer(program, {
  codec: { compress, decompress },
});
```

---

## AST Transformers

The compiler runs these optimisation passes automatically before encoding, in the order shown:

| # | Transformer | What it does |
|---|---|---|
| 1 | `TreeShaking` | Removes unused top-level function, class, and side-effect-free variable declarations |
| 2 | `InlineConstantVariables` | Replaces every reference to a `const` primitive literal with the literal itself, then removes the declaration |
| 3 | `ConstantFolding` | Evaluates constant expressions at compile time (`2 + 3` → `5`) |
| 4 | `DeadCodeElimination` | Removes unreachable code after `return`/`throw`/`break`/`continue` |
| 5 | `LogicalSimplification` | Simplifies `!!x`, `x === true`, `x === false`, etc. |
| 6 | `PowToMultiply` | Replaces `x ** 2` / `x ** 3` with equivalent multiplications |
| 7 | `ForEachToForLoop` | Converts `.forEach(cb)` to a `for` loop |
| 8 | `HoistArrayLength` | Caches `arr.length` outside the loop condition |
| 9 | `ForOfToIndexed` | Converts `for…of` over arrays to index-based `for` loops |
| 10 | `InlineArrowToFunction` | Converts inline arrow callbacks to `function` expressions where safe |
| 11 | `AssignedArrowToFunction` | Converts assigned arrow functions to regular `function` expressions (scope-aware) |
| 12 | `UnchainMapToLoop` | Converts `.map(fn)` chains to `for` loops |
| 13 | `UnchainFilterToLoop` | Converts `.filter(fn)` chains to `for` loops |
| 14 | `UnchainReduceToLoop` | Converts `.reduce(fn)` chains to `for` loops |
| 15 | `FusionLoop` | Merges consecutive loops over the same array |
| 16 | `RedundantReturnElimination` | Removes trailing `return;` / `return void 0;` from the end of function bodies |
| 17 | `ConsecutiveVarMerging` | Merges consecutive `const`/`let`/`var` declarations of the same kind into one (`const a = 1; const b = 2;` → `const a = 1, b = 2;`) |
| 18 | `RestoreExportedNames` | Preserves original names for exported bindings after renaming passes |

`InlineConstantVariables` (pass 2) feeds directly into `ConstantFolding` (pass 3): after literals are inlined, the folding pass collapses any resulting constant expressions in the same compilation run.

To disable individual transformers:

```ts
const program = compile(source, ["FusionLoop", "PowToMultiply"]);
```

The `"keep-functional"` preset keeps only the lightweight, purely-syntactic passes (passes 1–6, 16–18) and skips the loop-rewriting transformers:

```ts
const program = compile(source, "keep-functional");
```

---

## Benchmarks

The package ships Vitest benchmarks for `compile()` and `toBuffer()` against small, medium, and large JS fixtures.

```bash
pnpm bench
```

Example results (Apple M-series):

| Benchmark | ops/sec |
|---|---|
| `compile()` – small program | ~5 400 |
| `compile()` – medium program | ~1 900 |
| `compile()` – large program | ~330 |
| `toBuffer()` – small → binary | ~47 000 |
| `toBuffer()` – large → binary | ~20 500 |

---

## Known limitations

- **AOT side-effects** – Transformers may change observable behaviour if the input code relies on subtle JS semantics (e.g. exact prototype chains, `arguments` binding). Review the transformer list above for caveats.
- **Dynamic `import()` and top-level `await`** – Partially supported; behaviour depends on the runtime execution mode.

---

## License

GPL-3.0 — see [LICENSE](LICENSE).

