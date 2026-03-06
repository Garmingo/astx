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

import { encode as msgPackEncode } from "@msgpack/msgpack";
import {
  AstxCodec,
  CompiledProgram,
  FORMAT_VERSION,
  INLINE_VALUE_TYPES,
  MAGIC_HEADER,
  MINIMAL_AST_KEYS,
  PREDEFINED_TYPE_INDEX,
} from "@astx/shared";
import {
  NodeTransformer,
  Phase,
  TransformContext,
} from "./transformers/transformers.js";
import * as babelParser from "@babel/parser";
import { ForEachToForTransformer } from "./transformers/ForEachToForLoop";
import traverse from "@babel/traverse";
import { ConstantFoldingTransformer } from "./transformers/ConstantFolding";
import { DeadCodeEliminationTransformer } from "./transformers/DeadCodeElimination";
import { PowToMultiplyTransformer } from "./transformers/PowToMultiply";
import { LogicalSimplificationTransformer } from "./transformers/LogicalSimplification";
import { HoistArrayLengthTransformer } from "./transformers/HoistArrayLength";
import { ForOfToIndexedTransformer } from "./transformers/ForOfToIndexed";
import { InlineArrowToFunctionTransformer } from "./transformers/InlineArrowToFunction";
import { AssignedArrowToFunctionTransformer } from "./transformers/AssignedArrowToFunction";
import { UnchainMapToLoopTransformer } from "./transformers/UnchainMapToLoop";
import { UnchainFilterToLoopTransformer } from "./transformers/UnchainFilterToLoop";
import { UnchainReduceToLoopTransformer } from "./transformers/UnchainReduceToLoop";
import { FusionLoopTransformer } from "./transformers/FusionLoop";
import { RestoreExportedNamesTransformer } from "./transformers/RestoreExportedNames";
import { TreeShakingTransformer } from "./transformers/TreeShaking";
import { InlineConstantVariablesTransformer } from "./transformers/InlineConstantVariables";
import { RedundantReturnEliminationTransformer } from "./transformers/RedundantReturnElimination";
import { ConsecutiveVarMergingTransformer } from "./transformers/ConsecutiveVarMerging";

// Re-export AstxCodec so callers don't need to import from @astx/shared directly
export type { AstxCodec };
export type { AstxCodecOptions } from "@astx/shared";

// ─── Public options types ────────────────────────────────────────────────────

/**
 * Minimal logger interface accepted by {@link CompileOptions.logger}.
 * Implement this to redirect compiler output into your own logging system
 * (e.g. pino, winston, a test spy, …).
 */
export interface CompileLogger {
  /** Called for informational messages (only when `verbose` is `true`). */
  log(...args: unknown[]): void;
  /** Called for warnings (transformer failures). Always called regardless of `verbose`. */
  warn(...args: unknown[]): void;
}

export interface CompileOptions {
  /**
   * Generate a source map: one [line, col] entry per bytecode slot.
   * Null entries denote synthetic (generated) nodes.
   */
  sourceMap?: boolean;

  /**
   * Enable verbose compiler logging.
   * When `false` (default) all `[ASTX-Compiler]` log lines are suppressed.
   * When `true` the compiler logs which transformers are applied and to which nodes.
   */
  verbose?: boolean;

  /**
   * Custom logger used instead of `console` when provided.
   * Only informational (`.log`) calls respect `verbose`;
   * warning (`.warn`) calls are always forwarded.
   */
  logger?: CompileLogger;
}

export interface ToBufferOptions {
  /** Custom codec (default: Node.js built-in zstd via node:zlib). */
  codec?: AstxCodec;
  /** Zstd compression level (1–22, default 22). Only used by the default codec. */
  level?: number;
  /**
   * Pre-trained Zstd dictionary for better compression.
   * Train offline with `zstd --train` on representative .astx files,
   * then embed the resulting file as a Buffer / Uint8Array.
   * Both compiler and runtime must use the same dictionary.
   */
  dict?: Uint8Array;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Concatenate multiple Uint8Arrays into one – avoids Node-specific Buffer.concat. */
function concatUint8(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.byteLength;
  }
  return out;
}

/**
 * Default codec using Node.js built-in zstd (node:zlib, available since Node 21.7).
 * Does NOT support Zstd dictionaries – use a custom codec for that.
 * Throws a descriptive error in browser environments where node:zlib is absent.
 */
function createDefaultNodeCodec(): AstxCodec {
  return {
    async compress(data, opts) {
      if (opts?.dict) {
        throw new Error(
          "[ASTX] Dictionary compression requires a custom AstxCodec.\n" +
            "Example: import { compress } from '@mongodb-js/zstd'; " +
            "{codec: {compress: (d,o)=>compress(d,o?.level,o?.dict), decompress}}",
        );
      }
      // Dynamic import keeps node:zlib out of browser bundles
      const zlib = await import("node:zlib").catch(() => {
        throw new Error(
          "[ASTX] node:zlib is not available (browser environment?).\n" +
            "Provide a custom codec via the `codec` option in toBuffer().",
        );
      });
      const level = opts?.level ?? 22;
      return zlib.zstdCompressSync(
        data instanceof Buffer ? data : Buffer.from(data),
        {
          params: { [zlib.constants.ZSTD_c_compressionLevel]: level },
        },
      );
    },
    async decompress(data, opts) {
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

// ─── Variable collection ─────────────────────────────────────────────────────

const TRANSFORMERS: NodeTransformer<any>[] = [
  // Pre-pass: remove unused code and inline literals before loop transforms.
  TreeShakingTransformer,
  InlineConstantVariablesTransformer,
  // Main structural transforms.
  ConstantFoldingTransformer,
  DeadCodeEliminationTransformer,
  LogicalSimplificationTransformer,
  PowToMultiplyTransformer,
  ForEachToForTransformer,
  HoistArrayLengthTransformer,
  ForOfToIndexedTransformer,
  InlineArrowToFunctionTransformer,
  AssignedArrowToFunctionTransformer,
  UnchainMapToLoopTransformer,
  UnchainFilterToLoopTransformer,
  UnchainReduceToLoopTransformer,
  FusionLoopTransformer,
  // Post-pass: clean up after structural transforms.
  RedundantReturnEliminationTransformer,
  ConsecutiveVarMergingTransformer,
  RestoreExportedNamesTransformer,
];

function collectDeclaredVariables(ast: any): Set<string> {
  const declared = new Set<string>();

  function addFromPattern(pattern: any) {
    if (!pattern || typeof pattern !== "object") return;
    switch (pattern.type) {
      case "Identifier":
        if (pattern.name) declared.add(pattern.name);
        break;
      case "ObjectPattern":
        for (const prop of pattern.properties || []) {
          if (prop && prop.type === "ObjectProperty") {
            addFromPattern(prop.value);
          } else if (prop && prop.type === "RestElement") {
            addFromPattern(prop.argument);
          }
        }
        break;
      case "ArrayPattern":
        for (const el of pattern.elements || []) {
          if (!el) continue;
          if (el.type === "RestElement") addFromPattern(el.argument);
          else addFromPattern(el);
        }
        break;
      case "AssignmentPattern":
        addFromPattern(pattern.left);
        break;
      case "RestElement":
        addFromPattern(pattern.argument);
        break;
      default:
        break;
    }
  }

  function walk(node: any) {
    if (!node || typeof node !== "object") return;

    if (node.type === "VariableDeclarator") {
      if (node.id?.type === "Identifier") {
        declared.add(node.id.name);
      } else {
        // Destructuring declarations: let { a:b } = ...
        addFromPattern(node.id);
      }
    }

    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      if (node.id?.name) declared.add(node.id.name);
      node.params?.forEach((param: any) => addFromPattern(param));
    }

    // Treat assignment LHS identifiers and patterns as declared for renaming stability
    if (node.type === "AssignmentExpression") {
      addFromPattern(node.left);
    }

    for (const key in node) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (typeof value === "object" && value !== null) walk(value);
    }
  }

  walk(ast);
  return declared;
}

export function compile(
  jsCode: string,
  skipTransformers: string[] | "all" | "keep-functional" = [],
  opts?: CompileOptions,
): CompiledProgram {
  const ast = babelParser.parse(jsCode, { sourceType: "module" });
  const valueDict: any[] = [];
  const expressionDict: string[] = [];
  const bytecode: any[] = [];

  const declaredVars = collectDeclaredVariables(ast);
  const seenVars = new Map<string, number>();
  let varCounter = 0;

  // ─── Logger setup ─────────────────────────────────────────────────────────
  const verbose = opts?.verbose ?? false;
  const _logger: CompileLogger = opts?.logger ?? console;
  /** Log only when verbose is enabled. */
  const log = (...args: unknown[]) => {
    if (verbose) _logger.log(...args);
  };
  /** Always log warnings (transformer failures etc.), respecting custom logger. */
  const warn = (...args: unknown[]) => _logger.warn(...args);

  // Transformers
  const phases: Phase[] = ["pre", "main", "post"];
  const sharedData: Record<string, any> = {};

  if (skipTransformers === "all") {
    log(`[ASTX-Compiler] Skipping all transformers.`);
    skipTransformers = TRANSFORMERS.map((t) => t.key);
  }

  if (skipTransformers === "keep-functional") {
    log(`[ASTX-Compiler] Keeping functional transformers.`);
    // All transformers have been audited and fixed.  "keep-functional" now only
    // skips the loop-fusion / unchaining transformers that rewrite call-chain
    // semantics, and retains the lightweight, purely-syntactic transforms.
    const functionalTransformers = [
      "tree-shaking",
      "inline-constant-variables",
      "constant-folding",
      "dead-code-elimination",
      "logical-simplification",
      "pow-to-multiply",
      "redundant-return-elimination",
      "consecutive-var-merging",
      "restore-exported-names",
    ];

    skipTransformers = TRANSFORMERS.filter(
      // Only keep functional transformers - skip all others
      (t) => !functionalTransformers.includes(t.key),
    ).map((t) => t.key);
  }

  if (skipTransformers.length > 0) {
    log(
      `[ASTX-Compiler] Skipping transformers: ${skipTransformers.join(", ")}`,
    );
  }

  for (const phase of phases) {
    traverse(ast, {
      enter(path) {
        const context: TransformContext = {
          ast: ast,
          declaredVars: declaredVars,
          path: path,
          phase: phase,
          sharedData: sharedData,
          helpers: {
            generateUid(base) {
              const identifier = path.scope.generateUidIdentifier(base);
              declaredVars.add(identifier.name);
              return identifier;
            },
            replaceNode(from, to) {
              traverse(ast, {
                enter(path) {
                  // Array
                  if (Array.isArray(to)) {
                    if (path.node === from) {
                      path.replaceWithMultiple(to);
                    }
                  } else if (path.node === from) {
                    path.replaceWith(to);
                  }
                },
              });
            },
            insertBefore(node) {
              path.insertBefore(node);
            },
            insertAfter(node) {
              path.insertAfter(node);
            },
          },
          parent: path.parent,
        };

        for (const transformer of TRANSFORMERS) {
          if (!path.node) {
            // Skip removed nodes
            break;
          }

          if (skipTransformers.includes(transformer.key)) {
            // Skip this transformer
            continue;
          }

          const matchesPhase = transformer.phases
            ? transformer.phases.includes(phase)
            : true;
          const matchesType =
            !transformer.nodeTypes ||
            transformer.nodeTypes.includes(path.node.type);
          const passesTest = transformer.test(path.node, context);

          if (matchesPhase && matchesType && passesTest) {
            log(
              `[ASTX-Compiler][${phase.toUpperCase()}] Applying transformer "${
                transformer.displayName
              }" (${transformer.key}) to node: ${
                path.node.start ?? "Generated Node"
              } (Type: ${path.node.type}) ${
                path.node.loc?.start.line
                  ? `at line ${path.node.loc?.start.line}:${path.node.loc?.start.column}`
                  : "- Not in original source"
              }`,
            );

            try {
              const result = transformer.transform(path.node, context);

              if (result === null) {
                // Remove node from AST
                path.remove();
                break; // Stop applying transformers to this node (it's gone)
              } else if (Array.isArray(result)) {
                // Replace node with multiple nodes
                path.replaceWithMultiple(result);
              } else if (result !== path.node) {
                // Replace node with new node if it changed
                path.replaceWith(result);
              }
            } catch (e) {
              warn(
                `[ASTX-Compiler][${phase.toUpperCase()}] Transformer "${
                  transformer.displayName
                }" (${transformer.key}) failed: ${e}`,
              );
            }
          }
        }
      },
    });
  }

  // Unsupported node types will be logged and cause exit
  const unsupportedNodes: string[] = [];

  // Bytecode deduplication: identical node arrays share one slot.
  // Key: JSON.stringify(nodeArr) → bytecode index.
  const bytecodeIndex = new Map<string, number>();

  // Source map: one entry per bytecode slot ([line, col] or null).
  const sourceMapEntries: ([number, number] | null)[] | undefined =
    opts?.sourceMap ? [] : undefined;

  function encode(
    node: any,
    options?: { preserveIdentifierName?: boolean },
  ): number | undefined {
    if (!node || typeof node !== "object") return;

    const type = node.type || "null";
    const typeIndex = PREDEFINED_TYPE_INDEX.get(type);
    if (typeIndex === undefined) {
      // Track first encounter for the error message
      if (!unsupportedNodes.includes(type)) {
        unsupportedNodes.push(type);
      }
      return;
    }
    // Populate in-memory expressionDict lazily so CompiledProgram consumers
    // that still read expressionDict (e.g. third-party tools) get a valid value.
    if (!expressionDict.includes(type)) {
      expressionDict[typeIndex] = type;
    }

    const keys = MINIMAL_AST_KEYS[type] || [];
    const values: any[] = [];

    if (type === "TemplateElement") {
      let index = valueDict.findIndex(
        (v) => v && v.raw === node.value.raw && v.cooked === node.value.cooked,
      );
      if (index === -1) {
        index = valueDict.length;
        valueDict.push(node.value);
      }
      values.push(index, node.tail);
      const nodeArr = [typeIndex, ...values];
      // Deduplicate
      const tplKey = JSON.stringify(nodeArr);
      const tplExisting = bytecodeIndex.get(tplKey);
      if (tplExisting !== undefined) return tplExisting;
      const tplIdx = bytecode.length;
      bytecode.push(nodeArr);
      bytecodeIndex.set(tplKey, tplIdx);
      if (sourceMapEntries)
        sourceMapEntries.push(
          node.loc ? [node.loc.start.line, node.loc.start.column] : null,
        );
      return tplIdx;
    }

    for (const key of keys) {
      const value = node[key];

      // Preserve identifier names in non-renamable positions
      const preserveIdentifierName =
        options?.preserveIdentifierName === true ||
        // Object properties/methods keys should never be mangled
        ((type === "ObjectProperty" || type === "ObjectMethod") &&
          key === "key") ||
        // Class members keys should never be mangled
        ((type === "ClassProperty" || type === "ClassMethod") &&
          key === "key") ||
        // Member expression non-computed properties should never be mangled
        ((type === "MemberExpression" || type === "OptionalMemberExpression") &&
          key === "property" &&
          node.computed === false);

      if (
        key === "name" &&
        type === "Identifier" &&
        declaredVars.has(value) &&
        !preserveIdentifierName
      ) {
        if (!seenVars.has(value)) {
          seenVars.set(value, varCounter++);
        }
        values.push(seenVars.get(value));
      } else if (
        key === "value" &&
        (type === "Literal" || type.endsWith("Literal"))
      ) {
        if (INLINE_VALUE_TYPES.has(type)) {
          // Store directly as the native msgpack type (e.g. bool for BooleanLiteral).
          // This saves 2 valueDict slots and keeps the bytecode self-contained.
          values.push(value);
        } else {
          let index = valueDict.indexOf(value);
          if (index === -1) {
            index = valueDict.length;
            valueDict.push(value);
          }
          values.push(index);
        }
      } else if (Array.isArray(value)) {
        values.push(value.map((v) => (typeof v === "object" ? encode(v) : v)));
      } else if (typeof value === "object" && value !== null) {
        // When visiting child nodes, propagate preservation intent for special positions
        const childOptions =
          // Pass preserve flag for ObjectProperty/ObjectMethod/Class* keys and non-computed member properties
          ((type === "ObjectProperty" ||
            type === "ObjectMethod" ||
            type === "ClassProperty" ||
            type === "ClassMethod") &&
            key === "key") ||
          ((type === "MemberExpression" ||
            type === "OptionalMemberExpression") &&
            key === "property" &&
            node.computed === false)
            ? { preserveIdentifierName: true }
            : undefined;

        values.push(encode(value, childOptions));
      } else {
        values.push(value);
      }
    }

    const nodeArr = [typeIndex, ...values];

    // ─── Deduplication: reuse existing identical bytecode slot ───────────────
    const dedupKey = JSON.stringify(nodeArr);
    const existingIdx = bytecodeIndex.get(dedupKey);
    if (existingIdx !== undefined) return existingIdx;

    const newIdx = bytecode.length;
    bytecode.push(nodeArr);
    bytecodeIndex.set(dedupKey, newIdx);

    if (sourceMapEntries)
      sourceMapEntries.push(
        node.loc ? [node.loc.start.line, node.loc.start.column] : null,
      );

    return newIdx;
  }

  encode(ast.program); // Skip the File wrapper

  if (unsupportedNodes.length > 0) {
    throw new Error(
      `Compilation failed due to unsupported node types: ${unsupportedNodes.join(
        ", ",
      )}`,
    );
  }

  return {
    expressionDict,
    valueDict,
    bytecode,
    ...(sourceMapEntries !== undefined ? { sourceMap: sourceMapEntries } : {}),
  };
}

/**
 * Serialise a compiled program to a binary buffer.
 *
 * Works in Node.js (default codec) and in browsers when a custom `codec` is
 * supplied, e.g. one backed by `@mongodb-js/zstd` WASM.
 *
 * @param program   Output of {@link compile}.
 * @param opts      Optional codec / compression settings.
 */
export async function toBuffer(
  program: CompiledProgram,
  opts?: ToBufferOptions,
): Promise<Uint8Array> {
  const codec = opts?.codec ?? createDefaultNodeCodec();
  // Wire format v0x02: [valueDict, bytecode, sourceMap | null]
  const payload = msgPackEncode([
    program.valueDict,
    program.bytecode,
    program.sourceMap ?? null,
  ]);
  const payloadBytes =
    payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const compressed = await codec.compress(payloadBytes, {
    level: opts?.level,
    dict: opts?.dict,
  });
  const compressedBytes =
    compressed instanceof Uint8Array ? compressed : new Uint8Array(compressed);
  return concatUint8([MAGIC_HEADER, FORMAT_VERSION, compressedBytes]);
}

/**
 * Write a compiled program to a file (Node.js only).
 * In browser environments this will throw because `node:fs/promises` is
 * unavailable – use {@link toBuffer} and transmit the bytes as needed.
 */
export async function saveToFile(
  program: CompiledProgram,
  filename: string,
  opts?: ToBufferOptions,
): Promise<void> {
  const buf = await toBuffer(program, opts);
  const fs = await import("node:fs/promises").catch(() => {
    throw new Error(
      "[ASTX] saveToFile() requires Node.js (node:fs/promises not available).",
    );
  });
  await fs.writeFile(filename, buf);
}
