# @astx/runtime

Decodes and executes ASTX binary files. Part of the [ASTX monorepo](../../README.md).

---

## Installation

```bash
npm install @astx/runtime
```

---

## API

### `loadFromBuffer(buffer, opts?): Promise<CompiledProgram>`

Decodes an ASTX binary from a `Uint8Array` or `Buffer`.

```ts
import { loadFromBuffer, run } from "@astx/runtime";

const response = await fetch("/app.astx");
const bytes = new Uint8Array(await response.arrayBuffer());
const program = await loadFromBuffer(bytes);
run(program);
```

**Options (`LoadBufferOptions`):**

| Option | Type | Default | Description |
|---|---|---|---|
| `codec` | `AstxCodec` | Node.js built-in zstd | Custom decompression implementation |
| `dict` | `Uint8Array` | — | Zstd dictionary (must match the one used when compiling) |

---

### `loadFromFile(filename, opts?): Promise<CompiledProgram>`

Reads an `.astx` file from disk and decodes it. **Node.js only.**

```ts
import { loadFromFile, run } from "@astx/runtime";

const program = await loadFromFile("app.astx");
run(program, { mode: "vm" });
```

---

### `run(program, opts?)`

Executes a decoded `CompiledProgram`.

```ts
run(program, {
  mode: "vm",          // 'vm' (Node.js vm module) | 'eval' (direct eval)
  inject: {            // variables injected into the program's scope
    __dirname: "/app",
    __filename: "/app/index.astx",
  },
});
```

---

### `generateJSCode(program): string`

Converts a decoded `CompiledProgram` back to JavaScript source. Useful for debugging — the output is not minified or human-readable.

```ts
import { loadFromFile, generateJSCode } from "@astx/runtime";

const program = await loadFromFile("app.astx");
console.log(generateJSCode(program));
```

---

## Browser support

All APIs are browser-compatible. The default codec uses `node:zlib` via a dynamic import — in a browser you must supply a custom `AstxCodec`:

```ts
import { decompress } from "fzstd"; // pure-JS Zstd decompressor
import { loadFromBuffer, run } from "@astx/runtime";

const bytes = new Uint8Array(await (await fetch("/app.astx")).arrayBuffer());
const program = await loadFromBuffer(bytes, {
  codec: {
    compress: async () => { throw new Error("not needed"); },
    decompress: async (data) => decompress(data),
  },
});
run(program);
```

---

## Known limitations

- **Relative `require`/`import` paths** – resolved relative to the working directory of the host process, not the `.astx` file's original location. Use the `inject` option to set `__dirname` / `__filename` when using `vm` mode.
- **Dynamic `import()` inside `.astx`** – partially supported in `vm` mode.

---

## License

GPL-3.0 — see [LICENSE](LICENSE).

