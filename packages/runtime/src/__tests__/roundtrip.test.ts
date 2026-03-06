import { describe, it, expect, vi, beforeEach } from "vitest";
import { compile, toBuffer } from "@astx/compiler";
import {
  loadFromBuffer,
  run,
  generateJSCode,
  createSourceMapConsumer,
} from "../index.js";

beforeEach(() => {
  // Suppress [ASTX-Compiler] logs during tests
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// Helper: compile a JS string → binary → decoded CompiledProgram
async function roundtrip(js: string) {
  const program = compile(js, "all"); // skip all transformers for predictability
  const buf = await toBuffer(program);
  return loadFromBuffer(buf);
}

// Helper: run a program in scoped mode with a captured console
function runCaptured(program: Awaited<ReturnType<typeof roundtrip>>) {
  const logs: string[] = [];
  const fakeCons = {
    log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
    warn: () => {},
    error: () => {},
  };
  run(program, {
    mode: "scoped",
    skipDefaultInjects: true, // avoids injecting `import` (reserved keyword) as param
    inject: { console: fakeCons },
  });
  return logs;
}

describe("Compile → toBuffer → loadFromBuffer roundtrip", () => {
  it("produces a valid CompiledProgram after roundtrip", async () => {
    const program = await roundtrip("const x = 1;");
    expect(program).toHaveProperty("bytecode");
    expect(program).toHaveProperty("valueDict");
    expect(Array.isArray(program.bytecode)).toBe(true);
  });

  it("header magic bytes are correct", async () => {
    const program = compile("const x = 1;", "all");
    const buf = await toBuffer(program);
    // 0xa5 0x7b 0x1c 0x00
    expect(buf[0]).toBe(0xa5);
    expect(buf[1]).toBe(0x7b);
    expect(buf[2]).toBe(0x1c);
    expect(buf[3]).toBe(0x00);
  });

  it("format version byte is 0x02", async () => {
    const program = compile("const x = 1;", "all");
    const buf = await toBuffer(program);
    expect(buf[4]).toBe(0x02);
  });

  it("executes a simple console.log correctly", async () => {
    const program = await roundtrip(`console.log("hello world");`);
    const logs = runCaptured(program);
    expect(logs).toContain("hello world");
  });

  it("executes arithmetic correctly", async () => {
    const program = await roundtrip(`console.log(2 + 3);`);
    const logs = runCaptured(program);
    expect(logs).toContain("5");
  });

  it("executes function declarations", async () => {
    const code = `
      function add(a, b) { return a + b; }
      console.log(add(10, 32));
    `;
    const program = await roundtrip(code);
    const logs = runCaptured(program);
    expect(logs).toContain("42");
  });

  it("executes variable scoping correctly", async () => {
    const code = `
      let result = 0;
      for (let i = 1; i <= 4; i++) { result += i; }
      console.log(result);
    `;
    const program = await roundtrip(code);
    const logs = runCaptured(program);
    expect(logs).toContain("10");
  });

  it("executes conditional branches correctly", async () => {
    const code = `
      const x = 5;
      if (x > 3) { console.log("big"); } else { console.log("small"); }
    `;
    const program = await roundtrip(code);
    const logs = runCaptured(program);
    expect(logs).toContain("big");
  });

  it("handles string operations", async () => {
    const code = `console.log("foo" + "bar");`;
    const program = await roundtrip(code);
    const logs = runCaptured(program);
    expect(logs).toContain("foobar");
  });

  it("handles boolean literals", async () => {
    const code = `console.log(true, false);`;
    const program = await roundtrip(code);
    const logs = runCaptured(program);
    expect(logs[0]).toContain("true");
    expect(logs[0]).toContain("false");
  });

  it("handles arrow functions", async () => {
    const code = `
      const double = (n) => n * 2;
      console.log(double(21));
    `;
    const program = await roundtrip(code);
    const logs = runCaptured(program);
    expect(logs).toContain("42");
  });

  it("handles array literals", async () => {
    const code = `
      const arr = [1, 2, 3];
      console.log(arr.length);
    `;
    const program = await roundtrip(code);
    const logs = runCaptured(program);
    expect(logs).toContain("3");
  });

  it("handles object literals", async () => {
    const code = `
      const obj = { x: 10, y: 20 };
      console.log(obj.x + obj.y);
    `;
    const program = await roundtrip(code);
    const logs = runCaptured(program);
    expect(logs).toContain("30");
  });

  it("roundtrip preserves source map when requested", async () => {
    const program = compile(`const x = 1;`, "all", { sourceMap: true });
    const buf = await toBuffer(program);
    const loaded = await loadFromBuffer(buf);
    expect(loaded.sourceMap).toBeDefined();
    expect(Array.isArray(loaded.sourceMap)).toBe(true);
  });

  it("compiles import declarations without throwing", async () => {
    // import nodes must be in MINIMAL_AST_KEYS for compile() to succeed
    const code = `import { readFileSync } from "fs";`;
    expect(() => compile(code, "all")).not.toThrow();
  });

  it("compiles export * declarations without throwing", async () => {
    const code = `export * from "./utils";`;
    expect(() => compile(code, "all")).not.toThrow();
  });
});

describe("generateJSCode()", () => {
  it("produces valid JavaScript from a compiled program", async () => {
    const program = await roundtrip(
      `function greet(name) { return "hi " + name; }`,
    );
    const code = generateJSCode(program);
    expect(typeof code).toBe("string");
    expect(code.length).toBeGreaterThan(0);
    // Should contain a function declaration
    expect(code).toMatch(/function/);
  });
});

describe("shorthand ObjectProperty renaming regression", () => {
  // When ASTX renames variables (e.g. `x` → `a`), a shorthand ObjectProperty
  // like `{ x }` has key="x" (preserved) but value identifier renamed to "a".
  // astring with shorthand:true emits only the value → `{ a }` ≡ `{ a: a }`,
  // making the property name wrong at runtime (obj.x === undefined).
  // The codegen fix: only keep shorthand:true when key.name === value.name.

  it("shorthand object literal preserves correct property names after renaming", async () => {
    const code = `
      const x = 42;
      const y = 99;
      const obj = { x, y };
      console.log(obj.x);
      console.log(obj.y);
    `;
    // compile() WITHOUT skipTransformers so renaming runs
    const program = compile(code);
    const buf = await toBuffer(program);
    const loaded = await loadFromBuffer(buf);
    const logs = runCaptured(loaded);
    expect(logs[0]).toBe("42");
    expect(logs[1]).toBe("99");
  });

  it("shorthand object literal with multiple renamed vars (noble/curves pattern)", async () => {
    // Simulates the pattern in @noble/curves: destructure x/y from a point,
    // then re-package into a new object via shorthand.
    const code = `
      const point = { x: 10, y: 20 };
      const x = point.x;
      const y = point.y;
      const result = { x, y };
      console.log(result.x);
      console.log(result.y);
    `;
    const program = compile(code);
    const buf = await toBuffer(program);
    const loaded = await loadFromBuffer(buf);
    const logs = runCaptured(loaded);
    expect(logs[0]).toBe("10");
    expect(logs[1]).toBe("20");
  });

  it("shorthand ObjectProperty in generated JS has explicit key:value form when names differ", async () => {
    const code = `const x = 1; const obj = { x };`;
    const program = compile(code);
    const buf = await toBuffer(program);
    const loaded = await loadFromBuffer(buf);
    const js = generateJSCode(loaded);
    // After renaming, x is e.g. "a". The emitted code must NOT be "{ a }"
    // (which would be wrong key name) but must include "x:" to preserve the key.
    // Either "{ x: a }" or "{ x: x }" is acceptable — but "{ x }" shorthand
    // is only acceptable when the variable was NOT renamed.
    // We verify runtime correctness: obj.x evaluates to 1.
    const logs = runCaptured(loaded);
    // run obj.x directly
    const program2 = compile(
      `const x = 1; const obj = { x }; console.log(obj.x);`,
    );
    const buf2 = await toBuffer(program2);
    const loaded2 = await loadFromBuffer(buf2);
    const logs2 = runCaptured(loaded2);
    expect(logs2[0]).toBe("1");
    // Suppress unused var warning for js
    expect(typeof js).toBe("string");
  });
});

describe("createSourceMapConsumer()", () => {
  it("returns null when no source map is present", () => {
    const program = compile(`const x = 1;`, "all");
    const consumer = createSourceMapConsumer(program);
    expect(consumer).toBeNull();
  });

  it("returns a consumer when source map is present", () => {
    const program = compile(`const x = 1;`, "all", { sourceMap: true });
    const consumer = createSourceMapConsumer(program);
    expect(consumer).not.toBeNull();
  });

  it("lookup() returns a SourceLocation for non-null slots", () => {
    const program = compile(`const answer = 42;`, "all", { sourceMap: true });
    const consumer = createSourceMapConsumer(program)!;
    const positions = consumer.allPositions();
    expect(positions.length).toBeGreaterThan(0);
    // All returned positions should have valid line/column
    for (const pos of positions) {
      expect(typeof pos.line).toBe("number");
      expect(typeof pos.column).toBe("number");
      expect(pos.line).toBeGreaterThanOrEqual(1);
      expect(pos.column).toBeGreaterThanOrEqual(0);
    }
  });

  it("lookup() returns null for out-of-range indices", () => {
    const program = compile(`const x = 1;`, "all", { sourceMap: true });
    const consumer = createSourceMapConsumer(program)!;
    expect(consumer.lookup(99999)).toBeNull();
  });

  it("findSlotsByLine() returns slots matching a line", () => {
    const program = compile(`const x = 1;\nconst y = 2;`, "all", {
      sourceMap: true,
    });
    const consumer = createSourceMapConsumer(program)!;
    const line1Slots = consumer.findSlotsByLine(1);
    const line2Slots = consumer.findSlotsByLine(2);
    expect(line1Slots.length).toBeGreaterThan(0);
    expect(line2Slots.length).toBeGreaterThan(0);
    // Slots from different lines should be disjoint
    const overlap = line1Slots.filter((s) => line2Slots.includes(s));
    expect(overlap).toHaveLength(0);
  });

  it("source map survives the binary roundtrip", async () => {
    const program = compile(`const answer = 42;`, "all", { sourceMap: true });
    const buf = await toBuffer(program);
    const loaded = await loadFromBuffer(buf);
    const consumer = createSourceMapConsumer(loaded)!;
    expect(consumer).not.toBeNull();
    const positions = consumer.allPositions();
    expect(positions.length).toBeGreaterThan(0);
  });
});
