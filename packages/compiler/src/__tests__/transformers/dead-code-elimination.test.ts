import { describe, it, expect } from "vitest";
import { DeadCodeEliminationTransformer } from "../../transformers/DeadCodeElimination.js";
import { applyTransformer, strip } from "../helpers.js";

describe("DeadCodeElimination", () => {
  it("removes statements after return", () => {
    const code = `
function f() {
  return 1;
  console.log("never");
}`;
    const out = strip(applyTransformer(code, DeadCodeEliminationTransformer));
    expect(out).not.toContain("never");
    expect(out).toContain("return 1");
  });

  it("removes statements after throw", () => {
    const code = `
function f() {
  throw new Error("oops");
  return 42;
}`;
    const out = strip(applyTransformer(code, DeadCodeEliminationTransformer));
    expect(out).not.toContain("return 42");
  });

  it("removes statements after break in a loop", () => {
    const code = `
for (let i = 0; i < 10; i++) {
  break;
  console.log("unreachable");
}`;
    const out = strip(applyTransformer(code, DeadCodeEliminationTransformer));
    expect(out).not.toContain("unreachable");
  });

  it("keeps only consequent for if(true)", () => {
    const code = `if (true) { doA(); } else { doB(); }`;
    const out = strip(applyTransformer(code, DeadCodeEliminationTransformer));
    expect(out).toContain("doA()");
    expect(out).not.toContain("doB()");
  });

  it("keeps only alternate for if(false)", () => {
    const code = `if (false) { doA(); } else { doB(); }`;
    const out = strip(applyTransformer(code, DeadCodeEliminationTransformer));
    expect(out).not.toContain("doA()");
    expect(out).toContain("doB()");
  });

  it("removes entire if(false) statement with no alternate", () => {
    const code = `if (false) { doA(); }`;
    const out = strip(applyTransformer(code, DeadCodeEliminationTransformer));
    expect(out).not.toContain("doA()");
  });

  it("does not touch if with a variable condition", () => {
    const code = `if (x) { doA(); } else { doB(); }`;
    const out = strip(applyTransformer(code, DeadCodeEliminationTransformer));
    expect(out).toContain("doA()");
    expect(out).toContain("doB()");
  });

  it("does not modify blocks without early exits", () => {
    const code = `{ const a = 1; const b = 2; }`;
    const out = strip(applyTransformer(code, DeadCodeEliminationTransformer));
    expect(out).toContain("const a = 1");
    expect(out).toContain("const b = 2");
  });
});
