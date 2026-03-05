import { bench, describe, beforeAll } from "vitest";
import { compile, toBuffer } from "@astx/compiler";
import {
  loadFromBuffer,
  run,
  generateJSCode,
  type CompiledProgram,
} from "../index.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SMALL_JS = `
  function add(a, b) { return a + b; }
  add(1, 2);
`;

const MEDIUM_JS = `
  function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
  }
  fibonacci(10);
`;

// Pre-compiled programs (synchronous)
const smallProgram = compile(SMALL_JS, "all");
const mediumProgram = compile(MEDIUM_JS, "all");

// Buffers resolved in setup
let smallBuf: Uint8Array;
let mediumBuf: Uint8Array;
let loadedSmall: CompiledProgram;
let loadedMedium: CompiledProgram;
let smallCode: string;
let mediumCode: string;

// Shared beforeAll to build buffers and pre-load programs once
async function setup() {
  smallBuf = await toBuffer(smallProgram);
  mediumBuf = await toBuffer(mediumProgram);
  loadedSmall = await loadFromBuffer(smallBuf);
  loadedMedium = await loadFromBuffer(mediumBuf);
  smallCode = generateJSCode(loadedSmall);
  mediumCode = generateJSCode(loadedMedium);
}

// ── loadFromBuffer() ──────────────────────────────────────────────────────────

describe("loadFromBuffer() – decompression + decode", () => {
  beforeAll(setup);

  bench("small program", async () => {
    await loadFromBuffer(smallBuf);
  });

  bench("medium program", async () => {
    await loadFromBuffer(mediumBuf);
  });
});

// ── run() vs eval() ───────────────────────────────────────────────────────────

describe("run() – scoped execution vs native eval", () => {
  beforeAll(setup);

  // ASTX scoped execution
  bench("ASTX  small – scoped", () => {
    run(loadedSmall, { mode: "scoped", skipDefaultInjects: true, inject: {} });
  });

  bench("ASTX  medium – scoped", () => {
    run(loadedMedium, { mode: "scoped", skipDefaultInjects: true, inject: {} });
  });

  // Native baseline (eval the same generated JS source)
  bench("native eval small", () => {
    // eslint-disable-next-line no-eval
    eval(smallCode);
  });

  bench("native eval medium", () => {
    // eslint-disable-next-line no-eval
    eval(mediumCode);
  });
});

// ── End-to-end pipeline ───────────────────────────────────────────────────────

describe("Compile → Buffer → Load → Run (full pipeline)", () => {
  bench("small program end-to-end", async () => {
    const prog = compile(SMALL_JS, "all");
    const buf = await toBuffer(prog);
    const loaded = await loadFromBuffer(buf);
    run(loaded, { mode: "scoped", skipDefaultInjects: true, inject: {} });
  });
});
