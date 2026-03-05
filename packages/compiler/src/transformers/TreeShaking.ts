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
 * Tree-Shaking Transformer
 *
 * Removes unused top-level function and class declarations.
 *
 * Safety guarantee: Only declarations that have zero references AND are not
 * exported are removed.  Variable declarations are deliberately skipped
 * because their initialisers may produce side-effects (e.g. `fetch()`).
 *
 * The check is powered by Babel's own scope-binding analysis
 * (`scope.bindings[name].referenced`), so it correctly handles:
 *  - Hoisted function declarations used before their textual position
 *  - Recursive functions (self-references make them "referenced")
 *  - Names shadowed by inner scopes
 */
export const TreeShakingTransformer: NodeTransformer<t.Program> = {
  key: "tree-shaking",
  displayName: "Tree Shaking",
  nodeTypes: ["Program"],
  phases: ["pre"],

  test(node): node is t.Program {
    return t.isProgram(node);
  },

  transform(node: t.Program, context: TransformContext): t.Program {
    const scope = context.path.scope;

    // Collect the names of unreferenced, non-exported top-level bindings.
    const removable = new Set<string>();

    for (const [name, binding] of Object.entries(scope.bindings)) {
      if (binding.referenced) continue; // actively used

      // Check whether this binding is directly under an export declaration,
      // which counts as "externally referenced" even with no local uses.
      const parentPath = binding.path.parentPath;
      const isExported =
        parentPath?.isExportNamedDeclaration() ||
        parentPath?.isExportDefaultDeclaration() ||
        // e.g. `export function foo()` → FunctionDeclaration → ExportNamedDeclaration
        parentPath?.parentPath?.isExportNamedDeclaration() ||
        parentPath?.parentPath?.isExportDefaultDeclaration();

      if (!isExported) {
        removable.add(name);
      }
    }

    if (removable.size === 0) return node;

    const newBody = node.body.filter((stmt) => {
      // Remove unused top-level function declarations
      if (t.isFunctionDeclaration(stmt) && stmt.id) {
        return !removable.has(stmt.id.name);
      }

      // Remove unused top-level class declarations
      if (t.isClassDeclaration(stmt) && stmt.id) {
        return !removable.has(stmt.id.name);
      }

      // Remove unused top-level variable declarations **only when**
      // every declarator is an Identifier (not a pattern) AND its
      // initialiser is side-effect-free (literal or arrow function).
      if (t.isVariableDeclaration(stmt)) {
        const allSafeUnused = stmt.declarations.every((decl) => {
          if (!t.isIdentifier(decl.id)) return false; // pattern – keep
          if (!removable.has(decl.id.name)) return false; // used – keep

          // Only remove if the initialiser is provably side-effect-free
          const init = decl.init;
          if (!init) return true; // `let x;` – fine to drop
          return (
            t.isLiteral(init) ||
            t.isArrowFunctionExpression(init) ||
            t.isFunctionExpression(init) ||
            t.isClassExpression(init)
          );
        });

        return !allSafeUnused;
      }

      return true;
    });

    if (newBody.length === node.body.length) return node;

    return t.program(
      newBody,
      node.directives,
      node.sourceType,
      node.interpreter ?? undefined,
    );
  },
};
