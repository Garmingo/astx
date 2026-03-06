/*
 *   Copyright (c) 2025 Alexander Neitzel

 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.

 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.

 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { decode as msgpackDecode } from "@msgpack/msgpack";
import {
  AstxCodec,
  AstxCodecOptions,
  CompiledProgram,
  FORMAT_VERSION,
  INLINE_VALUE_TYPES,
  MAGIC_HEADER,
  MINIMAL_AST_KEYS,
  PREDEFINED_TYPES,
} from "@astx/shared";
import { generateCode } from "./codegen.js";

// Re-export codec types for callers who use only the runtime
export type { AstxCodec, AstxCodecOptions, CompiledProgram };

export interface LoadBufferOptions {
  /** Custom codec (default: Node.js built-in zstd via node:zlib). */
  codec?: AstxCodec;
  /**
   * Zstd dictionary used during compression – must match the one used in
   * {@link ToBufferOptions.dict} when the file was created.
   */
  dict?: Uint8Array;
}

/**
 * Default runtime codec using Node.js built-in zstd.
 * Throws a helpful error in browser environments.
 */
function createDefaultNodeCodec(): AstxCodec {
  return {
    async compress() {
      throw new Error("[ASTX] Runtime codec's compress() is not used.");
    },
    async decompress(data: Uint8Array, opts?: AstxCodecOptions) {
      if (opts?.dict) {
        throw new Error(
          "[ASTX] Dictionary decompression requires a custom AstxCodec.",
        );
      }
      const zlib = await import("node:zlib").catch(() => {
        throw new Error(
          "[ASTX] node:zlib is not available (browser environment?).\n" +
            "Provide a custom codec via the `codec` option in loadFromBuffer().",
        );
      });
      return zlib.zstdDecompressSync(
        data instanceof Buffer ? data : Buffer.from(data),
      );
    },
  };
}

const RESERVED_WORDS = new Set([
  "abstract",
  "await",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "double",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "final",
  "finally",
  "float",
  "for",
  "function",
  "goto",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "int",
  "interface",
  "let",
  "long",
  "native",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "volatile",
  "while",
  "with",
  "yield",
]);

function generateShortName(index: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let name = "";
  do {
    name = chars[index % chars.length] + name;
    index = Math.floor(index / chars.length) - 1;
  } while (index >= 0);

  // If the name is a reserved word, add an underscore
  if (RESERVED_WORDS.has(name)) {
    name = "_" + name;
  }

  return name;
}

/**
 * Load a compiled ASTX program from a file (Node.js only).
 * In browser environments this will throw – use {@link loadFromBuffer} instead.
 */
export async function loadFromFile(
  filename: string,
  opts?: LoadBufferOptions,
): Promise<CompiledProgram> {
  const fs = await import("node:fs/promises").catch(() => {
    throw new Error(
      "[ASTX] loadFromFile() requires Node.js (node:fs/promises not available).",
    );
  });
  const buf = await fs.readFile(filename);
  return loadFromBuffer(new Uint8Array(buf), opts);
}

/**
 * Decode a compiled ASTX program from a binary buffer.
 *
 * Works in Node.js (default codec) and in browsers when a custom `codec` is
 * supplied.
 */
export async function loadFromBuffer(
  buffer: Uint8Array | Buffer,
  opts?: LoadBufferOptions,
): Promise<CompiledProgram> {
  // Ensure we have a Uint8Array view (Buffer is a subclass in Node.js)
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const magic = view.subarray(0, 4);
  const version = view[4];

  if (
    magic[0] !== MAGIC_HEADER[0] ||
    magic[1] !== MAGIC_HEADER[1] ||
    magic[2] !== MAGIC_HEADER[2] ||
    magic[3] !== MAGIC_HEADER[3]
  ) {
    throw new Error("Invalid file format: bad magic number");
  }
  if (version !== FORMAT_VERSION[0]) {
    throw new Error(
      `Unsupported version: ${version} | Current version: ${FORMAT_VERSION[0]}`,
    );
  }

  const compressed = view.subarray(5);
  const codec = opts?.codec ?? createDefaultNodeCodec();
  const decompressed = await codec.decompress(compressed, { dict: opts?.dict });
  const decompressedBytes =
    decompressed instanceof Uint8Array
      ? decompressed
      : new Uint8Array(decompressed);

  // Wire format v0x02: [valueDict, bytecode, sourceMap | null]
  const decoded = msgpackDecode(decompressedBytes);
  const [valueDict, bytecode, sourceMap] = decoded as [
    any[],
    any[],
    ([number, number] | null)[] | null,
  ];

  // The expressionDict is reconstructed from the shared PREDEFINED_TYPES table;
  // it is no longer stored in the binary payload.
  const expressionDict: string[] = PREDEFINED_TYPES.slice();

  return {
    expressionDict,
    valueDict,
    bytecode,
    sourceMap: sourceMap ?? undefined,
  };
}

function decodeToAST(compiled: CompiledProgram): any {
  const { expressionDict, valueDict, bytecode } = compiled;

  function decode(index: number): any {
    const node = bytecode[index];
    if (!Array.isArray(node)) return;

    const [typeIndex, ...args] = node;
    const type = expressionDict[typeIndex];
    let obj: any;
    if (type === "TemplateElement") {
      const [valueArg, tailArg] = args;
      const val = valueDict[valueArg];
      return {
        type: "TemplateElement",
        value: { raw: val?.raw ?? "", cooked: val?.cooked ?? "" },
        tail: tailArg,
      };
    } else {
      obj = { type };
    }

    if (!type) {
      throw new Error(`Unknown expression type at index ${index}`);
    }

    const keys = MINIMAL_AST_KEYS[type] || [];
    keys.forEach((key: string, i: number) => {
      const arg = args[i];

      if (type === "Identifier" && key === "name") {
        if (typeof arg === "number") {
          obj.name = generateShortName(arg);
        } else {
          obj.name = arg;
        }
      } else if (
        (type === "Literal" || type.endsWith("Literal")) &&
        key === "value"
      ) {
        if (INLINE_VALUE_TYPES.has(type)) {
          // Value is stored inline as a native msgpack type (e.g. bool)
          obj[key] = arg;
        } else {
          obj[key] = valueDict[arg];
        }
      } else if (Array.isArray(arg)) {
        obj[key] = arg.map((a) => (typeof a === "number" ? decode(a) : a));
      } else if (typeof arg === "number" && bytecode[arg]) {
        obj[key] = decode(arg);
      } else {
        obj[key] = arg;
      }
    });

    return obj;
  }

  return decode(bytecode.length - 1);
}

export function generateJSCode(compiled: CompiledProgram): string {
  const ast = decodeToAST(compiled);
  return generateCode(ast);
}

type RunMode = "eval" | "scoped" | "vm";

interface RunOptions {
  mode?: RunMode;
  inject?: Record<string, any>;
  skipDefaultInjects?: boolean;
}

/**
 * Runs a compiled program.
 * @param compiled The compiled program
 * @param options The run options
 * @returns The result of the program (a Promise in VM mode)
 */
export function run(compiled: CompiledProgram, options: RunOptions = {}) {
  const code = generateJSCode(compiled);
  const mode: RunMode = options.mode ?? "eval";
  const inject = options.inject ?? {};

  let context: Record<string, any> = {};
  if (!options.skipDefaultInjects) {
    const defaultInjects = {
      require: typeof require !== "undefined" ? require : undefined,
      import: (path: string) => import(path), // dynamic import for ESM
      process: process,
      console: console,
    };

    context = { ...defaultInjects };
  }

  context = { ...context, ...inject };

  if (mode !== "vm" && !context.require && !options.skipDefaultInjects) {
    console.warn(
      "[ASTX Runtime] Warning: 'require' seems not to be available in the current environment.",
    );
  }

  if (mode === "eval") {
    // ✅ Simple eval, runs in current scope
    Object.assign(globalThis, context); // inject into global if needed
    return eval(code);
  }

  if (mode === "scoped") {
    // ✅ Use Function constructor with manual injection
    const argNames = Object.keys(context);
    const argValues = Object.values(context);
    const fn = new Function(...argNames, code);
    return fn(...argValues);
  }

  if (mode === "vm") {
    // ✅ Node.js only sandbox
    if (
      typeof process === "undefined" ||
      typeof process.versions?.node === "undefined"
    ) {
      throw new Error("VM mode is only supported in Node.js environments.");
    }

    const directory = inject.__dirname ?? process.cwd();
    const scopedRequire = (modulePath: string) => {
      if (!modulePath.startsWith(".")) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require(modulePath); // absolute path or bare module
      }
      // For relative paths, resolve using built-in path (dynamic import avoids
      // bundling node:path into browser builds since vm mode is Node-only).
      return import("node:path").then((pathMod) => {
        const resolved = pathMod.resolve(directory, modulePath);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require(resolved);
      });
    };

    return (async () => {
      const [{ default: vm }, pathMod] = await Promise.all([
        import("vm"),
        import("node:path"),
      ]);
      const vmContext = vm.createContext({
        __dirname: directory,
        __filename: pathMod.join(directory, "index.js"),
        ...context,
        require: scopedRequire,
      });
      const script = new vm.Script(code);
      return script.runInContext(vmContext);
    })();
  }

  throw new Error(`Unknown run mode: ${mode}`);
}

// ─── Source Map Consumer ─────────────────────────────────────────────────────

/**
 * An original source position resolved from an ASTX source map.
 */
export interface SourceLocation {
  /** 1-based line number in the original JS source. */
  line: number;
  /** 0-based column number in the original JS source. */
  column: number;
}

export interface SourceMapConsumer {
  /**
   * Return the original source position for a bytecode slot index.
   * Returns `null` for synthetic (generated) nodes that have no source location.
   */
  lookup(bytecodeIndex: number): SourceLocation | null;

  /**
   * Return every bytecode slot that has a recorded source location,
   * sorted by bytecode index.  Useful for coverage analysis.
   */
  allPositions(): Array<{ bytecodeIndex: number } & SourceLocation>;

  /**
   * Find the bytecode slot(s) closest to a given original source line.
   * Handy for mapping a runtime error position back to the original file.
   */
  findSlotsByLine(line: number): number[];
}

/**
 * Create a {@link SourceMapConsumer} from a compiled program that was compiled
 * with the `{ sourceMap: true }` option.
 *
 * Returns `null` if no source map is attached to the program.
 *
 * @example
 * ```ts
 * const program = compile(source, [], { sourceMap: true });
 * const buf = await toBuffer(program);
 * const loaded = await loadFromBuffer(buf);
 *
 * const consumer = createSourceMapConsumer(loaded);
 * if (consumer) {
 *   console.log(consumer.lookup(0)); // { line: 1, column: 0 }
 * }
 * ```
 */
export function createSourceMapConsumer(
  program: CompiledProgram,
): SourceMapConsumer | null {
  const map = program.sourceMap;
  if (!map || map.length === 0) return null;

  return {
    lookup(bytecodeIndex: number): SourceLocation | null {
      const entry = map[bytecodeIndex] ?? null;
      if (!entry) return null;
      return { line: entry[0], column: entry[1] };
    },

    allPositions() {
      const out: Array<{ bytecodeIndex: number } & SourceLocation> = [];
      for (let i = 0; i < map.length; i++) {
        const entry = map[i];
        if (entry)
          out.push({ bytecodeIndex: i, line: entry[0], column: entry[1] });
      }
      return out;
    },

    findSlotsByLine(line: number): number[] {
      const out: number[] = [];
      for (let i = 0; i < map.length; i++) {
        if (map[i]?.[0] === line) out.push(i);
      }
      return out;
    },
  };
}
