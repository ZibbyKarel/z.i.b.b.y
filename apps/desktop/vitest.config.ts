import { defineConfig } from "vitest/config";

// The Electron main process's pure logic (updater feed parsing, swap script, run
// counting). Nothing here boots Electron.
export default defineConfig({
  test: {
    name: "desktop",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
