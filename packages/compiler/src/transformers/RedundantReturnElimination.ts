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
 * Redundant Return Elimination
 *
 * Removes trailing `return;` / `return void 0;` statements from the END of a
 * function body, because falling off the end of a function is semantically
 * identical.
 *
 * Conservatism guarantees (zero false-positives):
 *  - Only acts on the very last statement of a function block.
 *  - Only removes returns with no value (`return;`) or `return void 0;`.
 *    `return undefined;` is ONLY removed when `undefined` is provably not
 *    shadowed in the enclosing scope (checked via `context.declaredVars`).
 *  - Skips generator functions — their return semantics affect iterator
 *    protocol and we prefer not to touch them.
 *  - Works on all other callable nodes: FunctionDeclaration, FunctionExpression,
 *    ArrowFunctionExpression, ObjectMethod, ClassMethod.
 *    Arrow functions with block bodies (`() => { … }`) are included;
 *    concise arrow bodies (`() => expr`) never have return statements.
 */
export const RedundantReturnEliminationTransformer: NodeTransformer<t.BlockStatement> =
  {
    key: "redundant-return-elimination",
    displayName: "Redundant Return Elimination",
    nodeTypes: ["BlockStatement"],
    phases: ["post"],

    test(node, context): node is t.BlockStatement {
      if (!t.isBlockStatement(node) || node.body.length === 0) return false;

      // The block must be the direct body of a callable construct.
      const parent = context.parent;
      if (!isFunctionLike(parent)) return false;

      // Skip generators — their return value feeds the iterator protocol.
      if ((parent as t.Function).generator) return false;

      // Check the last statement.
      const last = node.body[node.body.length - 1];
      return isRedundantReturn(last, context.declaredVars);
    },

    transform(
      node: t.BlockStatement,
      context: TransformContext,
    ): t.BlockStatement {
      const body = [...node.body];
      // Pop while the tail is a redundant return (handles stacked trailing returns).
      while (
        body.length > 0 &&
        isRedundantReturn(body[body.length - 1], context.declaredVars)
      ) {
        body.pop();
      }
      return t.blockStatement(body, node.directives);
    },
  };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isFunctionLike(node: t.Node | undefined | null): boolean {
  return (
    t.isFunctionDeclaration(node) ||
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node) ||
    t.isObjectMethod(node) ||
    t.isClassMethod(node)
  );
}

/**
 * Returns true if `stmt` is a return statement whose value is provably
 * `undefined` (same as falling off the end of any function).
 */
function isRedundantReturn(
  stmt: t.Statement | undefined,
  declaredVars: Set<string>,
): boolean {
  if (!stmt || !t.isReturnStatement(stmt)) return false;
  const arg = stmt.argument;

  // return;
  if (!arg) return true;

  // return void 0;  (void with a numeric 0 — unambiguously undefined)
  if (
    t.isUnaryExpression(arg) &&
    arg.operator === "void" &&
    t.isNumericLiteral(arg.argument) &&
    arg.argument.value === 0
  ) {
    return true;
  }

  // return undefined;  — only safe when `undefined` is NOT shadowed.
  if (
    t.isIdentifier(arg) &&
    arg.name === "undefined" &&
    !declaredVars.has("undefined")
  ) {
    return true;
  }

  return false;
}
