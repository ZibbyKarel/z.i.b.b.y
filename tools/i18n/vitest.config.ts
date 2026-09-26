// Standalone vitest config for tools/i18n. `tools/**` is not part of the
// repo's vitest workspace (vitest.workspace.ts only lists the app/lib
// packages), so this script's tests are not picked up by `pnpm test`. Run
// them explicitly:
//   pnpm exec vitest run --config tools/i18n/vitest.config.ts
// or:
//   pnpm exec vitest run tools/i18n --root .
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "i18n-tools",
    environment: "node",
    globals: true,
    include: ["tools/i18n/**/*.test.mjs"],
  },
});
