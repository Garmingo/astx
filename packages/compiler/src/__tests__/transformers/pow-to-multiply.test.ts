import { describe, it, expect } from "vitest";
import { PowToMultiplyTransformer } from "../../transformers/PowToMultiply.js";
import { applyTransformer, strip } from "../helpers.js";

describe("PowToMultiply", () => {
  it("replaces Math.pow(x, 2) with x * x", () => {
    const out = strip(
      applyTransformer("Math.pow(x, 2);", PowToMultiplyTransformer),
    );
    expect(out).toBe("x * x;");
  });

  it("replaces Math.pow(x, 3) with x * x * x", () => {
    const out = strip(
      applyTransformer("Math.pow(x, 3);", PowToMultiplyTransformer),
    );
    expect(out).toBe("x * x * x;");
  });

  it("replaces Math.pow(x, 4)", () => {
    const out = strip(
      applyTransformer("Math.pow(x, 4);", PowToMultiplyTransformer),
    );
    // Four multiplications, five x references
    expect(out).toBe("x * x * x * x;");
  });

  it("replaces Math.pow(x, 5)", () => {
    const out = strip(
      applyTransformer("Math.pow(x, 5);", PowToMultiplyTransformer),
    );
    expect(out).toBe("x * x * x * x * x;");
  });

  it("does NOT replace Math.pow(x, 1) – exponent below threshold", () => {
    const out = strip(
      applyTransformer("Math.pow(x, 1);", PowToMultiplyTransformer),
    );
    expect(out).toContain("Math.pow");
  });

  it("does NOT replace Math.pow(x, 6) – beyond cap", () => {
    const out = strip(
      applyTransformer("Math.pow(x, 6);", PowToMultiplyTransformer),
    );
    expect(out).toContain("Math.pow");
  });

  it("does NOT replace Math.pow with fractional exponent", () => {
    const out = strip(
      applyTransformer("Math.pow(x, 2.5);", PowToMultiplyTransformer),
    );
    expect(out).toContain("Math.pow");
  });

  it("does NOT touch Math.random()", () => {
    const out = strip(
      applyTransformer("Math.random();", PowToMultiplyTransformer),
    );
    expect(out).toBe("Math.random();");
  });
});
