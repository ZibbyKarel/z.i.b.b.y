import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "product-factory",
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
