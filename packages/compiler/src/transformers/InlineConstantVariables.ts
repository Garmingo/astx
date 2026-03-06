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

import * as t from "@babel/types";
import { NodeTransformer, TransformContext } from "./transformers.js";

/**
 * Inline Constant Variables
 *
 * Replaces every read-reference to a `const` variable initialised with a
 * primitive literal (number, string, boolean, null) with the literal itself,
 * then removes the now-unreferenced declaration.
 *
 * Safety guarantees:
 *  - Only `const` declarations are touched (the JS engine already guarantees
 *    no writes after initialisation).
 *  - Only primitives that are safe to duplicate: NumericLiteral, StringLiteral,
 *    BooleanLiteral, NullLiteral.  Objects/arrays/functions are skipped because
 *    reference identity matters there.
 *  - Exported bindings are never inlined (they must keep their declared name in
 *    the public interface).
 *  - Bindings with zero references are skipped (TreeShaking handles those).
 *  - The transformer runs in all three phases so cascades with ConstantFolding
 *    are processed within the same compilation run.
 */
export const InlineConstantVariablesTransformer: NodeTransformer<t.VariableDeclaration> =
  {
    key: "inline-constant-variables",
    displayName: "Inline Constant Variables",
    nodeTypes: ["VariableDeclaration"],
    phases: ["pre", "main", "post"],

    test(node): node is t.VariableDeclaration {
      return (
        t.isVariableDeclaration(node) &&
        node.kind === "const" &&
        node.declarations.some(
          (d) => t.isIdentifier(d.id) && isInlineableLiteral(d.init),
        )
      );
    },

    transform(
      node: t.VariableDeclaration,
      context: TransformContext,
    ): t.VariableDeclaration | null {
      const scope = context.path.scope;
      // Ensure scope bindings are up-to-date after any previous transforms.
      scope.crawl();

      const remaining: t.VariableDeclarator[] = [];

      for (const decl of node.declarations) {
        // Only handle simple identifier declarations with inlineable literals.
        if (!t.isIdentifier(decl.id) || !isInlineableLiteral(decl.init)) {
          remaining.push(decl);
          continue;
        }

        const name = decl.id.name;
        const binding = scope.bindings[name];

        if (!binding) {
          remaining.push(decl);
          continue;
        }

        // Never inline exported bindings — they must keep their declared name.
        const parentPath = binding.path.parentPath;
        if (
          parentPath?.isExportNamedDeclaration() ||
          parentPath?.isExportDefaultDeclaration() ||
          parentPath?.parentPath?.isExportNamedDeclaration() ||
          parentPath?.parentPath?.isExportDefaultDeclaration()
        ) {
          remaining.push(decl);
          continue;
        }

        // Skip if there are no references at all — TreeShaking removes those.
        if (binding.referencePaths.length === 0) {
          remaining.push(decl);
          continue;
        }

        // Inline: replace every reference with a fresh clone of the literal.
        // We collect reference paths first because replaceWith() mutates the
        // binding, which could invalidate mid-iteration.
        const refs = [...binding.referencePaths];
        const literal = cloneLiteral(decl.init!);
        for (const ref of refs) {
          try {
            ref.replaceWith(cloneLiteral(literal));
          } catch {
            // If a single replacement fails (e.g. the ref is already stale),
            // bail out conservatively and keep the declarator.
            remaining.push(decl);
            break;
          }
        }
        // Declarator intentionally not pushed → it will be removed.
      }

      if (remaining.length === node.declarations.length) return node; // nothing changed
      if (remaining.length === 0) return null; // whole declaration removed
      return t.variableDeclaration("const", remaining);
    },
  };

// ─── Helpers ─────────────────────────────────────────────────────────────────

type InlineableLiteral =
  | t.NumericLiteral
  | t.StringLiteral
  | t.BooleanLiteral
  | t.NullLiteral;

function isInlineableLiteral(
  node: t.Expression | null | undefined,
): node is InlineableLiteral {
  return (
    t.isNumericLiteral(node) ||
    t.isStringLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node)
  );
}

/** Returns a new AST node with the same value — avoids sharing references. */
function cloneLiteral(node: InlineableLiteral): InlineableLiteral {
  if (t.isNumericLiteral(node)) return t.numericLiteral(node.value);
  if (t.isStringLiteral(node)) return t.stringLiteral(node.value);
  if (t.isBooleanLiteral(node)) return t.booleanLiteral(node.value);
  return t.nullLiteral();
}
