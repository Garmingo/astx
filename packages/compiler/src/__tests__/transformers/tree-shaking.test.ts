import { describe, it, expect } from "vitest";
import { applyTransformer, strip } from "../helpers.js";
import { TreeShakingTransformer } from "../../transformers/TreeShaking.js";

describe("TreeShaking", () => {
  it("removes an unused top-level function declaration", () => {
    const result = applyTransformer(
      `
        function unused() { return 42; }
        function main() { return 1; }
        main();
      `,
      TreeShakingTransformer,
    );
    expect(result).not.toContain("unused");
    expect(result).toContain("main");
  });

  it("keeps a used top-level function declaration", () => {
    const result = applyTransformer(
      `
        function helper() { return 99; }
        helper();
      `,
      TreeShakingTransformer,
    );
    expect(result).toContain("helper");
  });

  it("removes an unused top-level class declaration", () => {
    const result = applyTransformer(
      `
        class UnusedAnimal {}
        class Dog {}
        new Dog();
      `,
      TreeShakingTransformer,
    );
    expect(result).not.toContain("UnusedAnimal");
    expect(result).toContain("Dog");
  });

  it("keeps a recursive function (self-reference counts as usage)", () => {
    const result = applyTransformer(
      `
        function fib(n) { return n <= 1 ? n : fib(n-1) + fib(n-2); }
      `,
      TreeShakingTransformer,
    );
    expect(result).toContain("fib");
  });

  it("removes unused variable with a literal initialiser", () => {
    const result = applyTransformer(
      `
        const UNUSED_CONST = 42;
        const USED = 1;
        console.log(USED);
      `,
      TreeShakingTransformer,
    );
    expect(result).not.toContain("UNUSED_CONST");
    expect(result).toContain("USED");
  });

  it("keeps a variable declaration with a side-effectful initialiser", () => {
    // fetch() may have side-effects — we must not shake this away
    const result = applyTransformer(
      `
        const res = fetch("https://example.com");
      `,
      TreeShakingTransformer,
    );
    expect(result).toContain("fetch");
  });

  it("keeps exported functions", () => {
    const result = applyTransformer(
      `
        export function exported() {}
        export function alsoExported() {}
      `,
      TreeShakingTransformer,
    );
    expect(result).toContain("exported");
    expect(result).toContain("alsoExported");
  });

  it("removes multiple unused functions in one pass", () => {
    const result = applyTransformer(
      `
        function a() {}
        function b() {}
        function c() {}
        function used() { return 1; }
        used();
      `,
      TreeShakingTransformer,
    );
    expect(strip(result)).not.toContain("function a(");
    expect(strip(result)).not.toContain("function b(");
    expect(strip(result)).not.toContain("function c(");
    expect(result).toContain("used");
  });
});
