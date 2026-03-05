/* eslint-disable @typescript-eslint/no-explicit-any */
import * as babelParser from "@babel/parser";
import traverse from "@babel/traverse";
import { default as _generate } from "@babel/generator";
import * as t from "@babel/types";
import type {
  NodeTransformer,
  TransformContext,
} from "../transformers/transformers.js";

// Handle ESM/CJS interop for @babel/generator
const generate: typeof _generate =
  (_generate as any).__esModule ||
  (_generate as any)[Symbol.toStringTag] === "Module"
    ? (_generate as any).default
    : _generate;

/**
 * Applies a single transformer to JS source code and returns the resulting code.
 * Runs the transformer in all its declared phases (or all 3 if unspecified).
 */
export function applyTransformer(
  code: string,
  transformer: NodeTransformer<any>,
): string {
  const ast = babelParser.parse(code, { sourceType: "module" });
  const sharedData: Record<string, any> = {};
  const declaredVars = new Set<string>();
  const phases = transformer.phases ?? (["pre", "main", "post"] as const);

  for (const phase of phases) {
    traverse(ast, {
      enter(path) {
        const matchesType =
          !transformer.nodeTypes ||
          transformer.nodeTypes.includes(path.node.type);
        if (!matchesType) return;

        const ctx: TransformContext = {
          ast,
          declaredVars,
          path,
          phase,
          sharedData,
          parent: path.parent,
          helpers: {
            generateUid: (base?: string) =>
              path.scope.generateUidIdentifier(base),
            replaceNode: (from: t.Node, to: t.Node | t.Node[]) => {
              if (Array.isArray(to)) path.replaceWithMultiple(to);
              else path.replaceWith(to);
            },
            insertBefore: (node: t.Node) => path.insertBefore(node),
            insertAfter: (node: t.Node) => path.insertAfter(node),
          },
        };

        if (!transformer.test(path.node, ctx)) return;

        try {
          const result = transformer.transform(path.node as any, ctx);
          if (result === null) path.remove();
          else if (Array.isArray(result)) path.replaceWithMultiple(result);
          else if (result !== path.node) path.replaceWith(result);
        } catch {
          // Let the test surface issues via assertions, not uncaught errors here
        }
      },
    });
  }

  return generate(ast).code;
}

/** Normalise whitespace for assertion comparisons. */
export function strip(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
