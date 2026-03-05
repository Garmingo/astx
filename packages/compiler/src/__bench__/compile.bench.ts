import { bench, describe } from "vitest";
import { compile, toBuffer } from "../index.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SMALL = `
  function add(a, b) { return a + b; }
  console.log(add(1, 2));
`;

const MEDIUM = `
  function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
  }
  const results = [];
  for (let i = 0; i < 20; i++) {
    results.push(fibonacci(i));
  }
  console.log(results);
`;

const LARGE = `
  class EventEmitter {
    constructor() { this._events = {}; }
    on(event, listener) {
      if (!this._events[event]) this._events[event] = [];
      this._events[event].push(listener);
      return this;
    }
    off(event, listener) {
      if (!this._events[event]) return this;
      this._events[event] = this._events[event].filter(l => l !== listener);
      return this;
    }
    emit(event, ...args) {
      if (!this._events[event]) return false;
      this._events[event].forEach(l => l(...args));
      return true;
    }
    once(event, listener) {
      const wrapped = (...args) => { listener(...args); this.off(event, wrapped); };
      return this.on(event, wrapped);
    }
  }

  const emitter = new EventEmitter();
  let count = 0;
  emitter.on("tick", () => count++);
  for (let i = 0; i < 100; i++) emitter.emit("tick");
  console.log(count);
`;

// ── compile() ─────────────────────────────────────────────────────────────────

describe("compile() – skip all transformers", () => {
  bench("small program", () => {
    compile(SMALL, "all");
  });

  bench("medium program", () => {
    compile(MEDIUM, "all");
  });

  bench("large program", () => {
    compile(LARGE, "all");
  });
});

describe("compile() – with all transformers", () => {
  bench("small program", () => {
    compile(SMALL);
  });

  bench("medium program", () => {
    compile(MEDIUM);
  });

  bench("large program", () => {
    compile(LARGE);
  });
});

// ── toBuffer() ────────────────────────────────────────────────────────────────

describe("toBuffer() – compression", () => {
  const programs = {
    small: compile(SMALL, "all"),
    medium: compile(MEDIUM, "all"),
    large: compile(LARGE, "all"),
  };

  bench("small → binary", async () => {
    await toBuffer(programs.small);
  });

  bench("medium → binary", async () => {
    await toBuffer(programs.medium);
  });

  bench("large → binary", async () => {
    await toBuffer(programs.large);
  });
});
