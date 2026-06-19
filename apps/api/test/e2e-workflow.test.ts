import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 15 — guard the Playwright CI job. Phase 14.3 made the e2e suite token-free
 * (fake-claude `CLAUDE_BIN`) and cold-start-deterministic, which is what let the ubuntu
 * `playwright` job be re-enabled on PRs. Two silent regressions would re-break that:
 * re-gating the job to `workflow_dispatch`-only (PRs lose e2e coverage), or dropping the
 * fake-claude `CLAUDE_BIN` from playwright.config (the runner would need a real `claude`).
 * This is a static-content guard on the load-bearing shape, not a CI/runner test.
 */
const ROOT = path.resolve(__dirname, "..", "..", "..");
const E2E_WORKFLOW = readFileSync(path.join(ROOT, ".github", "workflows", "e2e.yml"), "utf8");
const PW_CONFIG = readFileSync(path.join(ROOT, "playwright.config.ts"), "utf8");

describe("e2e.yml playwright job (15)", () => {
  it("is enabled on pull_request (not gated to workflow_dispatch-only)", () => {
    // The Phase 8.3→14.3 regression: a dispatch-only gate silently drops PR e2e coverage.
    expect(E2E_WORKFLOW).not.toContain("github.event_name == 'workflow_dispatch'");
    expect(E2E_WORKFLOW).toContain("github.event_name != 'push'");
    expect(E2E_WORKFLOW).toMatch(/on:[\s\S]*pull_request:/);
  });

  it("caches the Playwright browsers keyed on the Playwright version", () => {
    expect(E2E_WORKFLOW).toContain("~/.cache/ms-playwright");
    expect(E2E_WORKFLOW).toContain("steps.pw.outputs.version");
  });

  it("runs the suite and uploads the report", () => {
    expect(E2E_WORKFLOW).toMatch(/run:\s*pnpm exec playwright test/);
    expect(E2E_WORKFLOW).toContain("upload-artifact");
    expect(E2E_WORKFLOW).toContain("playwright-report");
  });

  it("uploads test-results/ so an on-retry trace bundle is retrievable (15→16)", () => {
    expect(E2E_WORKFLOW).toContain("test-results/");
  });
});

describe("playwright.config token-free guarantee (15)", () => {
  it("pins CLAUDE_BIN at the fake-claude stub so CI needs no real claude", () => {
    // 14.3's deterministic, token-free agent run depends on this. Drop it and the gated
    // approval throughline would spawn real `claude`, which no CI runner has.
    expect(PW_CONFIG).toContain("CLAUDE_BIN");
    expect(PW_CONFIG).toContain("fake-claude.mjs");
  });
});

describe("playwright.config CI flake safety net (16)", () => {
  it("retries only in CI, never locally", () => {
    // A silent revert to `retries: 0` re-arms the no-diagnostic-flake foot-gun; a blanket
    // local retry would hide exactly the cross-spec flakes 14.3 fixed.
    expect(PW_CONFIG).toMatch(/retries:\s*process\.env\.CI\s*\?\s*2\s*:\s*0/);
  });

  it("captures a trace + screenshot + video on the retry/failure", () => {
    expect(PW_CONFIG).toContain('trace: "on-first-retry"');
    expect(PW_CONFIG).toContain('screenshot: "only-on-failure"');
    expect(PW_CONFIG).toContain('video: "retain-on-failure"');
  });
});
