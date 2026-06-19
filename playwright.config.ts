import * as fs from "node:fs";
import * as path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e — the only browser-driven layer (a 6th project, deliberately
 * outside the vitest workspace). Covers a few critical UI throughlines where the
 * contract → DS wiring is the thing under test; runner/approval/loop *correctness*
 * lives in the fast NestJS + supertest e2e instead.
 *
 * Both servers are started with isolated `.e2e-data` dirs (gitignored) and demo
 * mode, so runs are deterministic and token-free. The app's default locale is
 * Czech; `global-setup` writes a `locale=en` cookie so selectors can use the
 * stable English strings.
 *
 * Requires browsers (`npx playwright install chromium`). In a sandbox without a
 * download, point at a system binary via PLAYWRIGHT_CHROMIUM_EXECUTABLE.
 */
const E2E_DATA = path.resolve(".e2e-data");
const dir = (name: string) => path.join(E2E_DATA, name);

const apiEnv: Record<string, string> = {
  AGENTS_DIR: dir("agents"),
  AGENT_RUNS_DIR: dir("agent-runs"),
  SKILLS_DIR: dir("skills"),
  SKILL_RUNS_DIR: dir("skill-runs"),
  PIPELINES_DIR: dir("pipelines"),
  PIPELINE_RUNS_DIR: dir("pipeline-runs"),
  APPROVALS_DIR: dir("approvals"),
  POLICY_DIR: dir("policy"),
  VAULT_DIR: dir("vault"),
  AUTOMATIONS_DIR: dir("automations"),
  AUTOMATION_TICK_MS: "0",
  INTEGRATIONS_DIR: dir("integrations"),
  CREDENTIALS_DIR: dir("credentials"),
  CHANNELS_DIR: dir("channels"),
  // CHANNEL_FAKE_DIR being set selects the fake channel adapter for every kind (the
  // test-only seam; there is no operator-facing adapter-mode knob).
  CHANNEL_FAKE_DIR: dir("channel-fake"),
  MANDATE_FILE: path.join(E2E_DATA, "mandate.json"),
  // A modest live tick so the channels throughline runs unprompted without adding
  // constant load to the shared single-process dev server.
  CHANNEL_TICK_MS: "1000",
  TASK_TICK_MS: "0",
  AGENT_DEMO_STEPS: "3",
  AGENT_DEMO_DELAY_MS: "80",
  PORT: "3333",
  // Deterministic, token-free agent runner: point the `claude` seam at the same
  // fake-claude stub the api e2e uses, and give it a benign mid-run INTENT. The
  // seeded gated agent (`requires_approval: true`) desugars to a catch-all `ask`
  // rule, so this reliably pauses the run and surfaces ONE pending agent approval
  // for approval.spec — instead of spawning real `claude` (slow, non-deterministic,
  // sometimes never gating), which is why the agent card used to be flaky/absent.
  CLAUDE_BIN: path.resolve("apps/api/test/fixtures/fake-claude.mjs"),
  FAKE_CLAUDE_INTENT: JSON.stringify({ action: "send_message", context: "post the drafted reply" }),
  FAKE_CLAUDE_STEPS: "4",
  FAKE_CLAUDE_DELAY_MS: "40",
};

const sandboxChrome =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const launchOptions = fs.existsSync(sandboxChrome)
  ? { executablePath: sandboxChrome }
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // Phase 16: retry only in CI (GHA sets CI=true; the self-hosted job sets CI=1). A genuine
  // one-off browser hiccup retries and passes; a real failure still fails on every attempt.
  // Locally `0` — flakes stay loud during development, never silently retried (a retry is a
  // CI safety net + flake detector, not a fix for a real flake).
  retries: process.env.CI ? 2 : 0,
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    storageState: "e2e/.auth/state.json",
    // Diagnostic bundle on the retry/failure so a CI flake is debuggable in the Trace Viewer
    // (the trace is dead config without retries — see `retries` above).
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(launchOptions ? { launchOptions } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run api:dev",
      url: "http://localhost:3333/api/health",
      env: apiEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "npm run web:dev",
      url: "http://localhost:3000",
      env: { NEXT_PUBLIC_API_URL: "http://localhost:3333" },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
