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
import { NodeTransformer, TransformContext } from "./transformers";

/**
 * Traverse an AST node, calling `fn` for every visited node.
 * Stops recursion into `FunctionDeclaration` and `FunctionExpression` bodies
 * because those create their own `this`/`arguments` bindings.
 * Arrow functions are NOT treated as boundaries (they inherit lexical this).
 */
function scopeAwareTraverse(node: t.Node, fn: (n: t.Node) => void): void {
  fn(node);
  // Do not cross into regular function bodies
  if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const key of Object.keys(node as any)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val = (node as any)[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === "object" && "type" in child)
          scopeAwareTraverse(child as t.Node, fn);
      }
    } else if (val && typeof val === "object" && "type" in val) {
      scopeAwareTraverse(val as t.Node, fn);
    }
  }
}

export const AssignedArrowToFunctionTransformer: NodeTransformer<t.VariableDeclaration> =
  {
    key: "assigned-arrow-to-function",
    displayName: "Arrow to Function (Assigned)",
    nodeTypes: ["VariableDeclaration"],
    phases: ["pre"],

    test(node): node is t.VariableDeclaration {
      if (!t.isVariableDeclaration(node)) return false;
      return node.declarations.some((decl) =>
        t.isArrowFunctionExpression(decl.init),
      );
    },

    transform(node, context: TransformContext): t.Node[] | null {
      const preHoisted: t.VariableDeclaration[] = [];
      const newDeclarations: t.VariableDeclarator[] = [];

      for (const decl of node.declarations) {
        const init = decl.init;

        if (!t.isArrowFunctionExpression(init)) {
          newDeclarations.push(decl);
          continue;
        }

        let usesThis = false;
        let usesArgs = false;

        // Only scan the arrow's own lexical scope — stop at
        // FunctionDeclaration/FunctionExpression boundaries so that `this` or
        // `arguments` used inside a nested regular function are NOT mistakenly
        // attributed to the outer arrow.
        scopeAwareTraverse(init.body, (n: t.Node) => {
          if (t.isThisExpression(n)) usesThis = true;
          if (t.isIdentifier(n, { name: "arguments" })) usesArgs = true;
        });

        const thisId = usesThis
          ? context.helpers.generateUid("this")
          : undefined;
        const argsId = usesArgs
          ? context.helpers.generateUid("args")
          : undefined;

        const originalBody = t.isBlockStatement(init.body)
          ? init.body
          : t.blockStatement([t.returnStatement(init.body)]);

        const rewrittenBody = rewriteLexicalReferences(
          originalBody,
          thisId,
          argsId,
        );

        const fnExpr = t.functionExpression(
          null,
          init.params,
          rewrittenBody,
          init.generator ?? false,
          init.async ?? false,
        );

        if (thisId) {
          preHoisted.push(
            t.variableDeclaration("const", [
              t.variableDeclarator(thisId, t.thisExpression()),
            ]),
          );
        }

        if (argsId) {
          preHoisted.push(
            t.variableDeclaration("const", [
              t.variableDeclarator(argsId, t.identifier("arguments")),
            ]),
          );
        }

        newDeclarations.push({
          ...decl,
          init: fnExpr,
        });
      }

      return [...preHoisted, t.variableDeclaration(node.kind, newDeclarations)];
    },
  };

function rewriteLexicalReferences(
  block: t.BlockStatement,
  thisId?: t.Identifier,
  argsId?: t.Identifier,
): t.BlockStatement {
  const cloned = t.cloneNode(block, true) as t.BlockStatement;

  function rewrite(node: t.Node) {
    if (thisId && t.isThisExpression(node)) {
      Object.assign(node, t.identifier(thisId.name));
    }
    if (argsId && t.isIdentifier(node, { name: "arguments" })) {
      Object.assign(node, t.identifier(argsId.name));
    }
    // Stop at regular function boundaries: their `this`/`arguments` are
    // separate and must not be rewritten.
    if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const key of Object.keys(node as any)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const val = (node as any)[key];
      if (Array.isArray(val)) {
        for (const child of val) {
          if (child && typeof child === "object" && "type" in child)
            rewrite(child as t.Node);
        }
      } else if (val && typeof val === "object" && "type" in val) {
        rewrite(val as t.Node);
      }
    }
  }

  rewrite(cloned);
  return cloned;
}
