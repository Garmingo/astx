import { describe, it, expect } from "vitest";
import { applyTransformer, strip } from "../helpers.js";
import { InlineConstantVariablesTransformer } from "../../transformers/InlineConstantVariables.js";

describe("InlineConstantVariables", () => {
  it("inlines a numeric constant", () => {
    const result = applyTransformer(
      `const X = 42; console.log(X);`,
      InlineConstantVariablesTransformer,
    );
    expect(result).toContain("console.log(42)");
    expect(result).not.toMatch(/const X/);
  });

  it("inlines a string constant", () => {
    const result = applyTransformer(
      `const S = "hello"; console.log(S);`,
      InlineConstantVariablesTransformer,
    );
    expect(result).toContain('"hello"');
    expect(result).not.toMatch(/const S/);
  });

  it("inlines a boolean constant", () => {
    const result = applyTransformer(
      `const FLAG = true; if (FLAG) { doSomething(); }`,
      InlineConstantVariablesTransformer,
    );
    expect(result).toContain("if (true)");
    expect(result).not.toMatch(/const FLAG/);
  });

  it("inlines a null constant", () => {
    const result = applyTransformer(
      `const EMPTY = null; fn(EMPTY);`,
      InlineConstantVariablesTransformer,
    );
    expect(result).toContain("fn(null)");
    expect(result).not.toMatch(/const EMPTY/);
  });

  it("inlines at multiple use-sites", () => {
    const result = applyTransformer(
      `const N = 10; for (let i = 0; i < N; i += N) {}`,
      InlineConstantVariablesTransformer,
    );
    expect(strip(result)).not.toContain("const N");
    // Both references to N should be replaced with 10
    expect(result).toContain("i < 10");
    expect(result).toContain("i += 10");
  });

  it("does not inline a non-primitive (arrow function)", () => {
    const result = applyTransformer(
      `const fn = () => 1; fn();`,
      InlineConstantVariablesTransformer,
    );
    expect(result).toContain("const fn");
  });

  it("does not inline an object literal", () => {
    const result = applyTransformer(
      `const OBJ = { a: 1 }; use(OBJ);`,
      InlineConstantVariablesTransformer,
    );
    expect(result).toContain("const OBJ");
  });

  it("does not inline an exported binding", () => {
    const result = applyTransformer(
      `export const PI = 3.14; use(PI);`,
      InlineConstantVariablesTransformer,
    );
    expect(result).toContain("export const PI");
  });

  it("does not inline a binding with zero references (TreeShaking territory)", () => {
    const result = applyTransformer(
      `const UNUSED = 99;`,
      InlineConstantVariablesTransformer,
    );
    // Zero refs → we leave it (TreeShaking will remove it)
    expect(result).toContain("const UNUSED");
  });

  it("partially inlines a mixed declarator list", () => {
    // a is primitive, b is a function call (not inlineable)
    const result = applyTransformer(
      `const a = 5, b = foo(); use(a); use(b);`,
      InlineConstantVariablesTransformer,
    );
    // a is inlined, b keeps its declaration
    expect(result).toContain("use(5)");
    expect(result).toContain("const b = foo()");
    expect(result).not.toMatch(/const a/);
  });
});
