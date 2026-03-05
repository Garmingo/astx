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
