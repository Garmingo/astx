import { describe, it, expect } from "vitest";
import { LogicalSimplificationTransformer } from "../../transformers/LogicalSimplification.js";
import { applyTransformer, strip } from "../helpers.js";

describe("LogicalSimplification", () => {
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

  it("does NOT strip !!x — ToBoolean must stay a boolean", () => {
    const out = strip(
      applyTransformer("!!x;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("!!x;");
  });

  it("does NOT simplify a single negation !x", () => {
    const out = strip(
      applyTransformer("!x;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("!x;");
  });

  it("does NOT rewrite x === true (not equivalent for non-booleans)", () => {
    const out = strip(
      applyTransformer("x === true;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("x === true;");
  });

  it("does NOT rewrite x === false", () => {
    const out = strip(
      applyTransformer("x === false;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("x === false;");
  });

  it("does NOT rewrite x !== true", () => {
    const out = strip(
      applyTransformer("x !== true;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("x !== true;");
  });

  it("does NOT rewrite == (loose equality)", () => {
    const out = strip(
      applyTransformer("x == true;", LogicalSimplificationTransformer),
    );
    expect(out).toBe("x == true;");
  });
});
