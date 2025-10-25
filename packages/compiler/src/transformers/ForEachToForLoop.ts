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

export const ForEachToForTransformer: NodeTransformer<t.CallExpression> = {
  phases: ["pre"],
  nodeTypes: ["CallExpression"],
  key: "forEach-to-for",
  displayName: "Convert .forEach() to for loop",

  test(node): node is t.CallExpression {
    return (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.property, { name: "forEach" }) &&
      node.arguments.length === 1 &&
      (t.isFunctionExpression(node.arguments[0]) ||
        t.isArrowFunctionExpression(node.arguments[0]))
    );
  },

  transform(node, context: TransformContext): t.Node {
    const array = (node.callee as t.MemberExpression).object;
    const callback = node.arguments[0] as
      | t.FunctionExpression
      | t.ArrowFunctionExpression;

    const [itemParamRaw, indexParamRaw] = callback.params;

    // Generate safe unique identifiers
    const indexId =
      indexParamRaw && t.isIdentifier(indexParamRaw)
        ? indexParamRaw
        : context.helpers.generateUid("i");

    // Hoist the array expression into a temporary to avoid re-evaluating it
    const arrayId = context.helpers.generateUid("arr");
    // Insert: const <arrayId> = <array>;
    context.helpers.insertBefore(
      t.variableDeclaration("const", [t.variableDeclarator(arrayId, array)])
    );

    // Construct loop body: create item binding (supports destructuring patterns)
    const loopBodyStatements: t.Statement[] = [];

    if (itemParamRaw) {
      if (t.isIdentifier(itemParamRaw)) {
        // const item = arr[index];
        loopBodyStatements.push(
          t.variableDeclaration("const", [
            t.variableDeclarator(
              itemParamRaw,
              t.memberExpression(arrayId, indexId, true)
            ),
          ])
        );
      } else if (t.isPattern(itemParamRaw)) {
        // const [a,b] = arr[index]; or const {x} = arr[index];
        loopBodyStatements.push(
          t.variableDeclaration("const", [
            t.variableDeclarator(
              itemParamRaw as t.LVal,
              t.memberExpression(arrayId, indexId, true)
            ),
          ])
        );
      } else {
        // Fallback: assign to generated item identifier
        const itemId = context.helpers.generateUid("item");
        loopBodyStatements.push(
          t.variableDeclaration("const", [
            t.variableDeclarator(
              itemId,
              t.memberExpression(arrayId, indexId, true)
            ),
          ])
        );
      }
    } else {
      // No item param — still evaluate the access once
      const itemId = context.helpers.generateUid("item");
      loopBodyStatements.push(
        t.variableDeclaration("const", [
          t.variableDeclarator(
            itemId,
            t.memberExpression(arrayId, indexId, true)
          ),
        ])
      );
    }

    if (t.isBlockStatement(callback.body)) {
      loopBodyStatements.push(...callback.body.body);
    } else {
      loopBodyStatements.push(t.expressionStatement(callback.body));
    }

    const loop = t.forStatement(
      t.variableDeclaration("let", [
        t.variableDeclarator(indexId, t.numericLiteral(0)),
      ]),
      t.binaryExpression(
        "<",
        indexId,
        t.memberExpression(arrayId, t.identifier("length"))
      ),
      t.updateExpression("++", indexId),
      t.blockStatement(loopBodyStatements)
    );

    return loop;
  },
};
