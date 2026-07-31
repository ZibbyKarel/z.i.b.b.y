import { defineConfig } from "vitest/config";

/**
 * 7th project in the workspace. Node env: everything here is either a pure
 * function over JSON or a Playwright-driven integration test that brings its
 * own browser. No jsdom — jsdom does no layout, so a geometry assertion under
 * it would be meaningless.
 */
export default defineConfig({
  test: {
    name: "design-match",
    root: __dirname,
    environment: "node",
    include: ["**/*.test.mjs"],
    testTimeout: 30_000,
  },
});
