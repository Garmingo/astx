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
 * Consecutive Variable Declaration Merging
 *
 * Merges adjacent `VariableDeclaration` statements of the same `kind` into a
 * single declaration, reducing the number of AST nodes and bytecode slots.
 *
 * ```js
 * // before
 * const a = 1;
 * const b = 2;
 * const c = 3;
 * // after
 * const a = 1, b = 2, c = 3;
 * ```
 *
 * Safety guarantees:
 *  - Only merges **consecutive** declarations of the **same kind** (`const`,
 *    `let`, or `var`).  Any non-declaration statement between two declarations
 *    acts as a barrier — the declarations are not merged across it.
 *  - Evaluation order is fully preserved: declarators are initialised
 *    left-to-right in a multi-declarator statement, matching the original
 *    top-to-bottom statement order.
 *  - Works on both `BlockStatement` and `Program` bodies.
 */
export const ConsecutiveVarMergingTransformer: NodeTransformer<
  t.BlockStatement | t.Program
> = {
  key: "consecutive-var-merging",
  displayName: "Consecutive Variable Declaration Merging",
  nodeTypes: ["BlockStatement", "Program"],
  phases: ["post"],

  test(node): node is t.BlockStatement | t.Program {
    return t.isBlockStatement(node) || t.isProgram(node);
  },

  transform(
    node: t.BlockStatement | t.Program,
    _context: TransformContext, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): t.BlockStatement | t.Program {
    const originalBody = node.body as t.Statement[];
    const newBody: t.Statement[] = [];

    for (const stmt of originalBody) {
      const prev = newBody[newBody.length - 1];

      if (
        prev &&
        t.isVariableDeclaration(prev) &&
        t.isVariableDeclaration(stmt) &&
        prev.kind === stmt.kind
      ) {
        // Replace the last entry with a merged declaration.
        newBody[newBody.length - 1] = t.variableDeclaration(prev.kind, [
          ...prev.declarations,
          ...stmt.declarations,
        ]);
      } else {
        newBody.push(stmt);
      }
    }

    if (newBody.length === originalBody.length) return node; // nothing changed

    if (t.isBlockStatement(node)) {
      return t.blockStatement(newBody, node.directives);
    }
    return t.program(
      newBody,
      node.directives,
      node.sourceType,
      node.interpreter ?? undefined,
    );
  },
};
