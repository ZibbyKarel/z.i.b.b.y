import * as path from "node:path";
import { defineConfig } from "@playwright/test";
import baseConfig from "../../playwright.config";

/**
 * ZB-14 — the ROUTE-MAP §1/§2 sweep. Deliberately its own Playwright project
 * (`testDir` below), so `pnpm e2e` never picks it up: it's a one-off validation
 * tool, not a CI regression gate. Reuses the root config's `webServer`/`use`
 * (the same isolated `.e2e-data`, the same fake-claude runner) and only swaps
 * `testDir` + `globalSetup` for its own seed extension.
 *
 * Run with `CI=1 pnpm exec playwright test -c tools/zc-sweep/playwright.config.ts`
 * — see this file's own docblock in `playwright.config.ts` for why `CI=1` is
 * required (it disables `reuseExistingServer`, so the sweep never talks to a
 * stray already-running dev server).
 */
const REPO_ROOT = path.resolve(__dirname, "../..");

export default defineConfig({
  ...baseConfig,
  testDir: path.resolve(__dirname),
  globalSetup: path.resolve(__dirname, "global-setup.ts"),
  use: {
    ...baseConfig.use,
    storageState: path.resolve(REPO_ROOT, "e2e/.auth/state.json"),
  },
  // `webServer[].cwd` defaults to this config file's own directory — force the
  // repo root (matches the root config) so `npm run api:dev`/`web:dev` resolve.
  webServer: Array.isArray(baseConfig.webServer)
    ? baseConfig.webServer.map((server) => ({ ...server, cwd: REPO_ROOT }))
    : baseConfig.webServer
      ? { ...baseConfig.webServer, cwd: REPO_ROOT }
      : undefined,
  // The sweep is read-heavy (many page loads) but still sequential — the shared
  // `.e2e-data` isn't safe for parallel workers, same as the root config.
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
});
