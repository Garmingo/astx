/**
 * Minimal Babel AST → ESTree adapter + astring-based code generator.
 *
 * @babel/generator + @babel/types together weigh ~300 KB in a bundle.
 * astring is ~15 KB. This adapter maps the Babel node types stored in ASTX
 * bytecode to their ESTree equivalents so astring can print them.
 *
 * Only the node types present in MINIMAL_AST_KEYS need to be handled.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { generate as astringGenerate } from "astring";

// ─── Babel → ESTree normalisation ────────────────────────────────────────────

/**
 * Recursively converts a Babel-flavoured AST node to an ESTree-compatible
 * node that astring can print.
 */
export function babelToEstree(node: any): any {
  if (node === null || node === undefined) return node;
  if (typeof node !== "object") return node;
  if (Array.isArray(node))
    return node.map((n) => (n && typeof n === "object" ? babelToEstree(n) : n));

  const { type } = node;

  // ── Literals ───────────────────────────────────────────────────────────────
  // Babel splits literals into typed nodes; ESTree uses a single `Literal`.

  if (type === "StringLiteral") {
    return {
      type: "Literal",
      value: node.value,
      raw: JSON.stringify(node.value),
    };
  }

  if (type === "NumericLiteral") {
    return { type: "Literal", value: node.value, raw: String(node.value) };
  }

  if (type === "BooleanLiteral") {
    return { type: "Literal", value: node.value, raw: String(node.value) };
  }

  if (type === "NullLiteral") {
    return { type: "Literal", value: null, raw: "null" };
  }

  if (type === "BigIntLiteral") {
    return {
      type: "Literal",
      bigint: node.value,
      raw: `${node.value}n`,
      // Provide a real BigInt value so downstream tools that inspect .value work
      value: BigInt(node.value),
    };
  }

  if (type === "RegExpLiteral") {
    let re: RegExp | undefined;
    try {
      re = new RegExp(node.pattern, node.flags);
    } catch {
      // Leave value undefined if the pattern is invalid
    }
    return {
      type: "Literal",
      value: re,
      raw: `/${node.pattern}/${node.flags}`,
      regex: { pattern: node.pattern, flags: node.flags },
    };
  }

  // ── Object members ─────────────────────────────────────────────────────────
  // Babel uses ObjectProperty/ObjectMethod; ESTree uses Property.

  if (type === "ObjectProperty") {
    const key = babelToEstree(node.key);
    const value = babelToEstree(node.value);
    // After ASTX identifier renaming, key.name and value.name can diverge
    // (e.g. shorthand `{ x }` becomes key="x", value="a" after renaming x→a).
    // astring blindly honours shorthand:true and emits just the value → `{ a }`
    // instead of `{ x: a }`, making the property name wrong at runtime.
    // Only keep shorthand when key and value are truly the same identifier.
    const isActuallyShorthand =
      (node.shorthand ?? false) &&
      key?.type === "Identifier" &&
      value?.type === "Identifier" &&
      key.name === value.name;
    return {
      type: "Property",
      key,
      value,
      kind: "init",
      method: false,
      shorthand: isActuallyShorthand,
      computed: node.computed ?? false,
    };
  }

  if (type === "ObjectMethod") {
    return {
      type: "Property",
      key: babelToEstree(node.key),
      value: {
        type: "FunctionExpression",
        id: null,
        params: (node.params ?? []).map(babelToEstree),
        body: babelToEstree(node.body),
        generator: node.generator ?? false,
        async: node.async ?? false,
        expression: false,
      },
      kind: node.kind === "method" ? "init" : (node.kind ?? "init"),
      method: (node.kind ?? "method") === "method",
      shorthand: false,
      computed: node.computed ?? false,
    };
  }

  // ── Class members ──────────────────────────────────────────────────────────
  // Babel ClassMethod → ESTree MethodDefinition
  // Babel ClassProperty → ESTree PropertyDefinition (ES2022)

  if (type === "ClassMethod") {
    return {
      type: "MethodDefinition",
      key: babelToEstree(node.key),
      value: {
        type: "FunctionExpression",
        id: null,
        params: (node.params ?? []).map(babelToEstree),
        body: babelToEstree(node.body),
        generator: node.generator ?? false,
        async: node.async ?? false,
        expression: false,
      },
      kind: node.kind ?? "method",
      static: node.static ?? false,
      computed: node.computed ?? false,
    };
  }

  if (type === "ClassProperty") {
    return {
      type: "PropertyDefinition",
      key: babelToEstree(node.key),
      value: node.value ? babelToEstree(node.value) : null,
      static: node.static ?? false,
      computed: node.computed ?? false,
    };
  }

  // ── Optional chaining ──────────────────────────────────────────────────────
  // Babel uses OptionalMemberExpression/OptionalCallExpression.
  // ESTree (ES2020) wraps optional chains in ChainExpression.

  if (type === "OptionalMemberExpression") {
    const inner = {
      type: "MemberExpression",
      object: babelToEstree(node.object),
      property: babelToEstree(node.property),
      computed: node.computed ?? false,
      optional: node.optional ?? true,
    };
    // Only wrap in ChainExpression at the root of the chain (not nested ones)
    return { type: "ChainExpression", expression: inner };
  }

  if (type === "OptionalCallExpression") {
    const inner = {
      type: "CallExpression",
      callee: babelToEstree(node.callee),
      arguments: (node.arguments ?? []).map(babelToEstree),
      optional: node.optional ?? true,
    };
    return { type: "ChainExpression", expression: inner };
  }

  // ── Everything else: deep-clone with recursive child conversion ────────────
  const out: any = { type };
  for (const key of Object.keys(node)) {
    if (key === "type") continue;
    const val = node[key];
    out[key] =
      val && typeof val === "object"
        ? Array.isArray(val)
          ? val.map((n: any) =>
              n && typeof n === "object" ? babelToEstree(n) : n,
            )
          : babelToEstree(val)
        : val;
  }
  return out;
}

// ─── Code generator ───────────────────────────────────────────────────────────

/**
 * Converts a Babel-format AST program node to a JavaScript source string,
 * using astring as the printer (ESTree-compatible, ~15 KB).
 */
export function generateCode(babelAst: any): string {
  const estree = babelToEstree(babelAst);
  return astringGenerate(estree);
}
