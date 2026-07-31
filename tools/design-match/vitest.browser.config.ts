import { defineConfig } from "vitest/config";

/**
 * Browser-driven tests, deliberately OUTSIDE `vitest.workspace.ts`: repo-wide
 * `pnpm test` and the default CI test step must stay browser-free. These run via
 * `pnpm test:browser`, which CI invokes as its own step so the coverage is not lost.
 */
export default defineConfig({
  test: {
    name: "design-match-browser",
    root: __dirname,
    environment: "node",
    include: ["**/*.browser.test.mjs"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
