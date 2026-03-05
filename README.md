# ASTX — Abstract Syntax Tree Executable

ASTX is an AST-based binary format for JavaScript. Instead of distributing raw source code, you compile JavaScript to a compact binary that any JavaScript runtime can execute via the ASTX runtime library.

> **Status:** Early stage – APIs may change between releases.

---

## Why ASTX?

| Goal | How ASTX achieves it |
|---|---|
| **Smaller distribution size** | AST nodes are encoded with MessagePack and compressed with Zstd (level 22) |
| **AOT optimisations** | The compiler runs a configurable pipeline of AST transformers before encoding |
| **Obfuscation** | Binary format is significantly harder to reverse-engineer than minified JS |
| **Runtime independence** | The runtime only needs a JS engine – Node.js, Deno, Bun, or a browser |
| **Full JS feature support** | Works at the AST level, so any syntactically valid JS can be compiled |

---

## Packages

| Package | Description |
|---|---|
| [`@astx/compiler`](packages/compiler) | Parses, optimises, and encodes JS → `.astx` |
| [`@astx/runtime`](packages/runtime) | Decodes and executes `.astx` files |
| [`@astx/shared`](packages/shared) | Shared types, constants, and the wire-format spec |
| [`@astx/cli`](apps/cli) | Command-line interface (`astx compile / run / gen`) |

---

## Quick start

### Install

```bash
# Compiler (e.g. in a build script)
npm install @astx/compiler

# Runtime (e.g. in your app)
npm install @astx/runtime

# CLI (global)
npm install -g @astx/cli
```

### Compile

```ts
import { compile, saveToFile } from "@astx/compiler";

const program = compile(`
  function greet(name) {
    console.log("Hello, " + name);
  }
  greet("world");
`);

await saveToFile(program, "greet.astx");
```

### Run

```ts
import { loadFromFile, run } from "@astx/runtime";

const program = await loadFromFile("greet.astx");
run(program, { mode: "vm" });
```

### CLI

```bash
astx compile src/index.js dist/index.astx
astx run dist/index.astx
```

---

## Binary format (v0x02)

```
[MAGIC_HEADER: 4 bytes] [FORMAT_VERSION: 1 byte] [Zstd-compressed payload]
                                                         │
                               ┌─────────────────────────┘
                               ▼  (MessagePack array)
                        [valueDict, bytecode, sourceMap | null]
```

- **valueDict** – deduplicated string/number/other literal values
- **bytecode** – deduplicated array of encoded AST node arrays (index-referenced)
- **sourceMap** – optional `[line, col][]` per bytecode slot; `null` entries for synthetic nodes

---

## Monorepo setup

This repo is managed with [pnpm workspaces](https://pnpm.io/workspaces) and [Turborepo](https://turbo.build/).

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Type-check all packages
pnpm -r check-types
```

---

## License

GPL-3.0 — see individual package `LICENSE` files for details.
