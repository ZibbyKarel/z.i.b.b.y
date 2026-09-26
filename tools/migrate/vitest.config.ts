// Standalone vitest config for tools/migrate. `tools/**` is not part of the
// repo's vitest workspace (vitest.workspace.ts only lists the app/lib
// packages), so this migration script's tests are not picked up by
// `pnpm test`. Run them explicitly:
//   pnpm exec vitest run --config tools/migrate/vitest.config.ts
// or:
//   pnpm exec vitest run tools/migrate --root .
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "migrate",
    environment: "node",
    globals: true,
    include: ["tools/migrate/**/*.test.mjs"],
  },
});
