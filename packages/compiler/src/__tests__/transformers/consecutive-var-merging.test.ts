import { describe, it, expect } from "vitest";
import { applyTransformer, strip } from "../helpers.js";
import { ConsecutiveVarMergingTransformer } from "../../transformers/ConsecutiveVarMerging.js";

describe("ConsecutiveVarMerging", () => {
  it("merges two consecutive const declarations", () => {
    const result = applyTransformer(
      `const a = 1;\nconst b = 2;`,
      ConsecutiveVarMergingTransformer,
    );
    expect(strip(result)).toBe(strip(`const a = 1, b = 2;`));
  });

  it("merges three consecutive const declarations", () => {
    const result = applyTransformer(
      `const a = 1;\nconst b = 2;\nconst c = 3;`,
      ConsecutiveVarMergingTransformer,
    );
    expect(strip(result)).toBe(strip(`const a = 1, b = 2, c = 3;`));
  });

  it("merges two consecutive let declarations", () => {
    const result = applyTransformer(
      `let a = 1;\nlet b = 2;`,
      ConsecutiveVarMergingTransformer,
    );
    expect(strip(result)).toBe(strip(`let a = 1, b = 2;`));
  });

  it("does not merge declarations of different kinds", () => {
    const result = applyTransformer(
      `const a = 1;\nlet b = 2;`,
      ConsecutiveVarMergingTransformer,
    );
    // Must remain as two separate statements
    expect(strip(result)).toBe(strip(`const a = 1;\nlet b = 2;`));
  });

  it("does not merge declarations separated by a statement", () => {
    const result = applyTransformer(
      `const a = 1;\nconsole.log(a);\nconst b = 2;`,
      ConsecutiveVarMergingTransformer,
    );
    // The console.log acts as a barrier — a and b must NOT be merged.
    const stripped = strip(result);
    expect(stripped).toContain("const a = 1");
    expect(stripped).toContain("const b = 2");
    expect(stripped).not.toContain("const a = 1, b");
  });

  it("leaves already-merged declarations unchanged", () => {
    const code = `const a = 1, b = 2;`;
    const result = applyTransformer(code, ConsecutiveVarMergingTransformer);
    expect(strip(result)).toBe(strip(code));
  });

  it("merges inside a function body", () => {
    const result = applyTransformer(
      `function foo() { const x = 10;\nconst y = 20;\nreturn x + y; }`,
      ConsecutiveVarMergingTransformer,
    );
    expect(strip(result)).toContain("const x = 10, y = 20");
  });

  it("preserves side-effectful initialisers in correct order", () => {
    // a = sideEffect() must be called before b = 2, even after merging.
    const result = applyTransformer(
      `const a = sideEffect();\nconst b = 2;`,
      ConsecutiveVarMergingTransformer,
    );
    // Merged, but a must still come before b in the declarator list.
    expect(strip(result)).toBe(strip(`const a = sideEffect(), b = 2;`));
  });

  it("handles a mix of merged and unmerged groups", () => {
    const result = applyTransformer(
      `const a = 1;\nconst b = 2;\nfoo();\nconst c = 3;\nconst d = 4;`,
      ConsecutiveVarMergingTransformer,
    );
    const stripped = strip(result);
    expect(stripped).toContain("const a = 1, b = 2");
    expect(stripped).toContain("const c = 3, d = 4");
  });
});
