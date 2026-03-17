/*
 *   Copyright (c) 2025 Garmingo and the ASTX Contributors

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

/**
 * Codec abstraction for compression/decompression.
 * The default Node.js implementation uses the built-in zstd engine.
 * For browsers, supply a custom codec (e.g. backed by @mongodb-js/zstd WASM
 * or fzstd for decompression-only scenarios).
 */
export interface AstxCodecOptions {
  /** Zstd compression level (1–22). Default: 22. */
  level?: number;
  /**
   * Pre-trained Zstd dictionary for improved compression ratios.
   * Train with `zstd --train` on representative .astx output files.
   * Both compressor and decompressor must use the same dictionary.
   */
  dict?: Uint8Array;
}

export interface AstxCodec {
  compress(
    data: Uint8Array,
    opts?: AstxCodecOptions,
  ): Uint8Array | Promise<Uint8Array>;
  decompress(
    data: Uint8Array,
    opts?: AstxCodecOptions,
  ): Uint8Array | Promise<Uint8Array>;
}

/**
 * The representation of an ASTX compiled program.
 */
export interface CompiledProgram {
  /**
   * The dictionary of expressions used in the program.
   * The expressions are stored as strings.
   */
  expressionDict: string[];
  /**
   * The dictionary of values used in the program.
   * The values are stored as strings.
   */
  valueDict: any[];
  /**
   * The dictionary of AST nodes used in the program.
   * The AST nodes are stored in a custom format.
   */
  bytecode: any[];
  /**
   * Optional source map: one [line, col] entry per bytecode slot.
   * Present only when compiled with { sourceMap: true }.
   * Null entries denote generated/synthetic nodes.
   */
  sourceMap?: ([number, number] | null)[] | null;
}

export const MAGIC_HEADER = new Uint8Array([0xa5, 0x7b, 0x1c, 0x00]);
/**
 * Format version history:
 *  0x01 – initial format: [expressionDict, valueDict, bytecode] compressed with Brotli
 *  0x02 – expressionDict eliminated (predefined via PREDEFINED_TYPES), Zstd level-22;
 *          wire payload: [valueDict, bytecode, sourceMap | null]
 */
export const FORMAT_VERSION = new Uint8Array([0x02]);

export const MINIMAL_AST_KEYS: Record<string, string[]> = {
  // Program structure
  Program: ["body", "sourceType"],
  BlockStatement: ["body"],

  // Declarations
  VariableDeclaration: ["declarations", "kind"],
  VariableDeclarator: ["id", "init"],
  FunctionDeclaration: ["id", "params", "body", "generator", "async"],
  ExportNamedDeclaration: ["declaration", "specifiers", "source"],
  ExportDefaultDeclaration: ["declaration"],
  ClassDeclaration: [
    "id",
    "superClass",
    "body",
    "decorators",
    "abstract",
    "declare",
    "implements",
  ],

  // Expressions
  BinaryExpression: ["left", "operator", "right"],
  UpdateExpression: ["operator", "argument", "prefix"],
  AssignmentExpression: ["left", "operator", "right"],
  CallExpression: ["callee", "arguments"],
  MemberExpression: ["object", "property", "computed", "optional"],
  ArrowFunctionExpression: [
    "params",
    "body",
    "expression",
    "generator",
    "async",
  ],
  ExpressionStatement: ["expression"],
  NewExpression: ["callee", "arguments"],
  UnaryExpression: ["operator", "argument", "prefix"],
  LogicalExpression: ["left", "operator", "right"],
  ConditionalExpression: ["test", "consequent", "alternate"],
  ObjectExpression: ["properties"],
  OptionalMemberExpression: ["object", "property", "computed", "optional"],
  OptionalCallExpression: ["callee", "arguments", "optional"],
  ArrayExpression: ["elements"],
  ClassExpression: ["id", "superClass", "body", "decorators", "implements"],
  ThisExpression: [],
  AwaitExpression: ["argument"],
  FunctionExpression: ["id", "params", "body", "generator", "async"],
  SequenceExpression: ["expressions"],
  YieldExpression: ["argument", "delegate"],
  TaggedTemplateExpression: ["tag", "quasi"],

  // Statements
  IfStatement: ["test", "consequent", "alternate"],
  ForStatement: ["init", "test", "update", "body"],
  WhileStatement: ["test", "body"],
  ReturnStatement: ["argument"],
  ForOfStatement: ["left", "right", "body", "await"],
  ContinueStatement: ["label"],
  BreakStatement: ["label"],
  ThrowStatement: ["argument"],
  SwitchStatement: ["discriminant", "cases"],
  ForInStatement: ["left", "right", "body"],
  DoWhileStatement: ["body", "test"],
  TryStatement: ["block", "handler", "finalizer"],
  LabeledStatement: ["label", "body"],
  WithStatement: ["object", "body"],
  EmptyStatement: [],

  // Literals and Identifiers
  Identifier: ["name"],
  Literal: ["value"],
  NumericLiteral: ["value"],
  StringLiteral: ["value"],
  BooleanLiteral: ["value"],
  NullLiteral: [],
  RegExpLiteral: ["pattern", "flags"],
  TemplateLiteral: ["quasis", "expressions"],
  BigIntLiteral: ["value"],

  // Elements
  RestElement: ["argument"],
  SpreadElement: ["argument"],
  TemplateElement: ["value", "tail"],

  // Patterns
  AssignmentPattern: ["left", "right"],
  ObjectPattern: ["properties"],
  ArrayPattern: ["elements"],

  // Other
  ObjectProperty: ["key", "value", "computed", "shorthand"],
  ObjectMethod: [
    "kind",
    "key",
    "params",
    "body",
    "computed",
    "generator",
    "async",
  ],
  ClassProperty: ["key", "value", "static", "computed"],
  ClassBody: ["body"],
  ClassMethod: [
    "kind",
    "key",
    "params",
    "body",
    "static",
    "computed",
    "generator",
    "async",
  ],
  SwitchCase: ["test", "consequent"],
  null: [],
  CatchClause: ["param", "body"],
  Super: [],
  ExportSpecifier: ["local", "exported"],

  // ES Module imports
  ImportDeclaration: ["specifiers", "source"],
  ImportDefaultSpecifier: ["local"],
  ImportNamespaceSpecifier: ["local"],
  ImportSpecifier: ["local", "imported"],

  // Additional exports
  ExportAllDeclaration: ["source", "exported"],
  ExportNamespaceSpecifier: ["exported"],

  // Decorators
  Decorator: ["expression"],

  // Meta properties (new.target, import.meta)
  MetaProperty: ["meta", "property"],

  // Miscellaneous
  InterpreterDirective: ["value"],

  // Private class members
  ClassPrivateProperty: ["key", "value", "static"],
  ClassPrivateMethod: [
    "kind",
    "key",
    "params",
    "body",
    "static",
    "generator",
    "async",
  ],
  PrivateName: ["id"],
};

/**
 * Fixed, ordered list of all AST node type names derived from MINIMAL_AST_KEYS.
 * The position in this array is the stable on-disk type index used in format v0x02+.
 * Both compiler and runtime derive the mapping from this single source of truth,
 * so the expressionDict no longer needs to be stored in the binary file.
 */
export const PREDEFINED_TYPES: string[] = Object.keys(MINIMAL_AST_KEYS);

/**
 * Inverse lookup: node type name → stable integer index.
 */
export const PREDEFINED_TYPE_INDEX: Map<string, number> = new Map(
  PREDEFINED_TYPES.map((name, idx) => [name, idx]),
);

/**
 * Literal node types whose `value` field is stored INLINE in the bytecode
 * using the native msgpack type rather than as a valueDict index.
 *
 * - BooleanLiteral:  stored as msgpack bool  (1 byte each, saves 2 valueDict slots)
 *
 * NullLiteral is implicitly handled: MINIMAL_AST_KEYS lists no fields for it.
 */
export const INLINE_VALUE_TYPES = new Set<string>(["BooleanLiteral"]);

export * from "./compatability";
