import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "spend-audit",
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
