import { describe, it, expect } from "vitest";
import { LogicalSimplificationTransformer } from "../../transformers/LogicalSimplification.js";
import { applyTransformer, strip } from "../helpers.js";

describe("LogicalSimplification", () => {
  // Double negation
  it("simplifies !!x to x", () => {
    const out = strip(
      applyTransformer("!!x;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("x;");
  });

  // Boolean literal negation
  it("simplifies !true to false", () => {
    const out = strip(
      applyTransformer("!true;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("false;");
  });

  it("simplifies !false to true", () => {
    const out = strip(
      applyTransformer("!false;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("true;");
  });

  // x === true / x === false
  it("simplifies x === true to x", () => {
    const out = strip(
      applyTransformer("x === true;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("x;");
  });

  it("simplifies x === false to !x", () => {
    const out = strip(
      applyTransformer("x === false;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("!x;");
  });

  // true === x / false === x
  it("simplifies true === x to x", () => {
    const out = strip(
      applyTransformer("true === x;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("x;");
  });

  it("simplifies false === x to !x", () => {
    const out = strip(
      applyTransformer("false === x;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("!x;");
  });

  // x !== true / x !== false
  it("simplifies x !== true to !x", () => {
    const out = strip(
      applyTransformer("x !== true;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("!x;");
  });

  it("simplifies x !== false to x", () => {
    const out = strip(
      applyTransformer("x !== false;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("x;");
  });

  // true !== x / false !== x
  it("simplifies true !== x to !x", () => {
    const out = strip(
      applyTransformer("true !== x;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("!x;");
  });

  it("simplifies false !== x to x", () => {
    const out = strip(
      applyTransformer("false !== x;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("x;");
  });

  // Non-triggering cases
  it("does NOT simplify a single negation !x", () => {
    const out = strip(
      applyTransformer("!x;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("!x;");
  });

  it("does NOT simplify == (loose equality)", () => {
    const out = strip(
      applyTransformer("x == true;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("x == true;");
  });
});
