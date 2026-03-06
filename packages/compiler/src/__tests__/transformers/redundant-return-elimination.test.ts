import { describe, it, expect } from "vitest";
import { applyTransformer, strip } from "../helpers.js";
import { RedundantReturnEliminationTransformer } from "../../transformers/RedundantReturnElimination.js";

describe("RedundantReturnElimination", () => {
  it("removes a bare trailing return from a function", () => {
    const result = applyTransformer(
      `function foo() { doSomething(); return; }`,
      RedundantReturnEliminationTransformer,
    );
    expect(strip(result)).toBe(strip(`function foo() { doSomething(); }`));
  });

  it("removes a return-only function body", () => {
    const result = applyTransformer(
      `function foo() { return; }`,
      RedundantReturnEliminationTransformer,
    );
    expect(strip(result)).toBe(strip(`function foo() {}`));
  });

  it("removes return void 0", () => {
    const result = applyTransformer(
      `function foo() { doX(); return void 0; }`,
      RedundantReturnEliminationTransformer,
    );
    expect(strip(result)).toBe(strip(`function foo() { doX(); }`));
  });

  it("removes return undefined (when not shadowed)", () => {
    const result = applyTransformer(
      `function foo() { doX(); return undefined; }`,
      RedundantReturnEliminationTransformer,
    );
    expect(strip(result)).toBe(strip(`function foo() { doX(); }`));
  });

  it("keeps a non-redundant return value", () => {
    const result = applyTransformer(
      `function foo() { return 42; }`,
      RedundantReturnEliminationTransformer,
    );
    expect(result).toContain("return 42");
  });

  it("only removes the trailing redundant return, keeps earlier returns", () => {
    const result = applyTransformer(
      `function foo() { if (x) return 1; return; }`,
      RedundantReturnEliminationTransformer,
    );
    expect(result).toContain("return 1");
    expect(strip(result)).not.toMatch(/return;/);
  });

  it("works on FunctionExpression", () => {
    const result = applyTransformer(
      `const f = function() { doX(); return; };`,
      RedundantReturnEliminationTransformer,
    );
    expect(strip(result)).not.toMatch(/return/);
  });

  it("works on ArrowFunctionExpression with a block body", () => {
    const result = applyTransformer(
      `const f = () => { doX(); return; };`,
      RedundantReturnEliminationTransformer,
    );
    expect(strip(result)).not.toMatch(/return/);
  });

  it("skips generator functions", () => {
    const result = applyTransformer(
      `function* gen() { yield 1; return; }`,
      RedundantReturnEliminationTransformer,
    );
    expect(result).toContain("return");
  });

  it("does not remove a return inside an if-block (only removes from function tail)", () => {
    // The block body of the `if` is not a function body — the transformer only
    // strips trailing returns from the outer function block. The inner if-branch
    // has no trailing return, so nothing changes at all.
    const code = `function foo() { if (cond) { doSomething(); } return; }`;
    const result = applyTransformer(
      code,
      RedundantReturnEliminationTransformer,
    );
    // The trailing `return;` on foo itself is removed; the if-block is untouched.
    expect(strip(result)).toBe(
      strip(`function foo() { if (cond) { doSomething(); } }`),
    );
  });

  it("works on async functions", () => {
    const result = applyTransformer(
      `async function fetchData() { await load(); return; }`,
      RedundantReturnEliminationTransformer,
    );
    expect(strip(result)).not.toMatch(/return/);
  });
});
