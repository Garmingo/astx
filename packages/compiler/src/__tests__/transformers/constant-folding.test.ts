import { describe, it, expect } from "vitest";
import { ConstantFoldingTransformer } from "../../transformers/ConstantFolding.js";
import { applyTransformer, strip } from "../helpers.js";

describe("ConstantFolding", () => {
  it("folds integer addition", () => {
    const out = strip(applyTransformer("1 + 2;", ConstantFoldingTransformer));
    expect(out).toBe("3;");
  });

  it("folds integer subtraction", () => {
    const out = strip(applyTransformer("10 - 4;", ConstantFoldingTransformer));
    expect(out).toBe("6;");
  });

  it("folds integer multiplication", () => {
    const out = strip(applyTransformer("3 * 7;", ConstantFoldingTransformer));
    expect(out).toBe("21;");
  });

  it("folds integer division", () => {
    const out = strip(applyTransformer("10 / 2;", ConstantFoldingTransformer));
    expect(out).toBe("5;");
  });

  it("folds string concatenation", () => {
    const out = strip(
      applyTransformer('"hello" + " world";', ConstantFoldingTransformer),
    );
    expect(out).toBe('"hello world";');
  });

  it("folds boolean equality", () => {
    const out = strip(applyTransformer("1 === 1;", ConstantFoldingTransformer));
    expect(out).toBe("true;");
  });

  it("folds boolean inequality", () => {
    const out = strip(applyTransformer("1 === 2;", ConstantFoldingTransformer));
    expect(out).toBe("false;");
  });

  it("does NOT fold expressions with variables", () => {
    const out = strip(applyTransformer("x + 2;", ConstantFoldingTransformer));
    expect(out).toBe("x + 2;");
  });

  it("does NOT fold division resulting in Infinity", () => {
    // 1/0 = Infinity – not a valid JS numeric literal, leave as-is
    const out = strip(applyTransformer("1 / 0;", ConstantFoldingTransformer));
    expect(out).toBe("1 / 0;");
  });

  it("does NOT fold NaN results", () => {
    const out = strip(applyTransformer("0 / 0;", ConstantFoldingTransformer));
    expect(out).toBe("0 / 0;");
  });
});
