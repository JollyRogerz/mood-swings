import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    maxWorkers: 1,
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
  },
});
