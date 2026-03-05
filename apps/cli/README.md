# @astx/cli

Command-line interface for the [ASTX](../../README.md) toolchain. Compile, run, and inspect `.astx` binary files.

---

## Installation

```bash
npm install -g @astx/cli
```

---

## Commands

### `astx compile <input> <output>`

Compile a JavaScript file to an ASTX binary.

```bash
astx compile src/index.js dist/index.astx
```

The `.astx` extension is appended automatically if omitted from `<output>`.

#### `--watch` / `-w`

Watch the input file and recompile automatically on every save.

```bash
astx compile --watch src/index.js dist/index.astx
```

Each recompile prints a timestamped line:

```
Watching src/index.js for changes… (Ctrl+C to stop)
[12:34:56] Compiled src/index.js → dist/index.astx in 12.4ms
[12:35:02] Compiled src/index.js → dist/index.astx in 11.9ms
```

Compile errors during watch are printed without stopping the watcher.

---

### `astx run <file>`

Execute an ASTX binary file.

```bash
astx run dist/index.astx
```

The program runs in `vm` mode; `__dirname` and `__filename` are injected based on the file's location.

---

### `astx gen <input> <output>`

Decompile an ASTX binary back to JavaScript source. The output is not optimised or human-readable — intended for debugging only.

```bash
astx gen dist/index.astx dist/index.debug.js
```

---

### `astx version`

Print the installed versions of the CLI and compiler.

```bash
astx version
```

---

## License

GPL-3.0 — see the [ASTX repository](https://github.com/Garmingo/astx) for details.
