import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // During tests, resolve @astx/compiler and @astx/shared from their
      // TypeScript sources so Vitest/Vite processes all code consistently
      // (avoids stale dist / version mismatches between CJS and ESM builds).
      "@astx/compiler": path.resolve(__dirname, "../compiler/src/index.ts"),
      "@astx/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  benchmark: {
    include: ["src/**/*.bench.ts"],
  },
});
