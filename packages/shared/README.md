# @astx/shared

Shared types, constants, and wire-format specification for the [ASTX](../../README.md) toolchain.

This package is an internal dependency — you generally don't install it directly. Its types are re-exported from `@astx/compiler` and `@astx/runtime`.

---

## Exported types

### `AstxCodec`

Interface for pluggable compression/decompression. Implement this to use ASTX in a browser or with a Zstd dictionary.

```ts
export interface AstxCodec {
  compress(data: Uint8Array, opts?: AstxCodecOptions): Uint8Array | Promise<Uint8Array>;
  decompress(data: Uint8Array, opts?: AstxCodecOptions): Uint8Array | Promise<Uint8Array>;
}
```

### `AstxCodecOptions`

```ts
export interface AstxCodecOptions {
  level?: number;      // Zstd compression level 1–22
  dict?: Uint8Array;   // Pre-trained Zstd dictionary
}
```

### `CompiledProgram`

In-memory representation of a compiled ASTX program.

```ts
export interface CompiledProgram {
  expressionDict: string[];                          // AST node type names
  valueDict: any[];                                  // Deduplicated literal values
  bytecode: any[];                                   // Encoded AST nodes
  sourceMap?: ([number, number] | null)[] | null;    // Optional [line, col] per slot
}
```

---

## Wire format (v0x02)

```
Offset  Length  Field
──────────────────────────────────
0       4       MAGIC_HEADER  (0xa5 0x7b 0x1c 0x00)
4       1       FORMAT_VERSION (0x02)
5       …       Zstd-compressed MessagePack payload
```

The decompressed payload is a MessagePack array:
```
[valueDict, bytecode, sourceMap | null]
```

`expressionDict` is **not** stored on disk — it is reconstructed from `PREDEFINED_TYPES` (the ordered list of known AST node type names).

---

## License

GPL-3.0 — see [LICENSE](LICENSE).
