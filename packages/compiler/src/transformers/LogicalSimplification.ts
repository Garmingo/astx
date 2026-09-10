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

export const LogicalSimplificationTransformer: NodeTransformer<
  t.UnaryExpression
> = {
  key: "logical-simplification",
  displayName: "Simplify Boolean Expressions",
  nodeTypes: ["UnaryExpression"],
  phases: ["main"],

  test(node): node is t.UnaryExpression {
    return (
      t.isUnaryExpression(node) &&
      node.operator === "!" &&
      t.isBooleanLiteral(node.argument)
    );
  },

  transform(node, _context: TransformContext): t.Expression {
    // Only fold ! on boolean literals. `!!x → x` and `x === true → x` change
    // the runtime type (e.g. number → still number) and break Zod boolean
    // schemas such as `earlyEntry: z.boolean()` after `!!taskId`.
    return t.booleanLiteral(!node.argument.value);
  },
};
