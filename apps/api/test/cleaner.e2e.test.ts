import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgentRunnerService } from "../src/agents/agent-runner.service";
import { AppModule } from "../src/app.module";

const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/fake-claude.mjs",
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(fn: () => Promise<T>, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out");
    await sleep(40);
  }
}

const exists = (p: string) =>
  fs
    .access(p)
    .then(() => true)
    .catch(() => false);

/** The junk/duplicate files Cleaner proposes to delete, plus the keepers. */
const JUNK = ["scratch.tmp", "build.log", "empty.txt", ".DS_Store", "report-copy (1).txt"];
async function seedTarget(dir: string): Promise<void> {
  await fs.writeFile(path.join(dir, "report-final.txt"), "the only copy that matters\n", "utf8");
  await fs.writeFile(path.join(dir, "report-copy.txt"), "duplicate me\n", "utf8");
  await fs.writeFile(path.join(dir, "report-copy (1).txt"), "duplicate me\n", "utf8");
  await fs.writeFile(path.join(dir, "scratch.tmp"), "throwaway\n", "utf8");
  await fs.writeFile(path.join(dir, "build.log"), "noisy build output\n", "utf8");
  await fs.writeFile(path.join(dir, "empty.txt"), "", "utf8");
  await fs.writeFile(path.join(dir, ".DS_Store"), " ", "utf8");
}

/**
 * The Cleaner agent end to end: a real `claude -p` run (stubbed) is granted access
 * to a target directory, announces its deletions through the PreToolUse approval
 * hook (intent-request → gate → decision), pauses on the `delete` floor rule, and
 * removes exactly the approved files only after approval — leaving the target dir
 * itself the only place anything is deleted (no coordination files leak into it).
 */
describe("Cleaner agent (Variant B, e2e)", () => {
  let app: INestApplication;
  let agentsDir: string;
  let runsDir: string;
  let approvalsDir: string;
  let policyDir: string;

  async function boot(): Promise<INestApplication> {
    process.env.AGENTS_DIR = agentsDir;
    process.env.AGENT_RUNS_DIR = runsDir;
    process.env.APPROVALS_DIR = approvalsDir;
    process.env.POLICY_DIR = policyDir;
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    process.env.FAKE_CLAUDE_DELETE = JUNK.join(",");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const fresh = moduleRef.createNestApplication();
    await fresh.init();
    return fresh;
  }

  const runStatus = async (runId: string) =>
    (await request(app.getHttpServer()).get(`/api/tasks/runs/${runId}`).expect(200)).body
      .status as string;

  const pendingFor = async (runId: string) => {
    const res = await request(app.getHttpServer())
      .get("/api/approvals")
      .query({ status: "pending" })
      .expect(200);
    return res.body.find((a: { runId: string }) => a.runId === runId);
  };

  /** Make a fresh seeded target directory the Cleaner will be granted. */
  async function freshTarget(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clean-target-"));
    await seedTarget(dir);
    return dir;
  }

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "clean-agents-"));
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "clean-runs-"));
    approvalsDir = await fs.mkdtemp(path.join(os.tmpdir(), "clean-store-"));
    policyDir = await fs.mkdtemp(path.join(os.tmpdir(), "clean-policy-"));
    app = await boot();

    // No gates: the `delete` floor rule (ask:human) does the gating on its own.
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({ id: "cleaner", name: "Cleaner", instructions: "tidies directories", risk: "high" })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    for (const d of [agentsDir, runsDir, approvalsDir, policyDir]) {
      await fs.rm(d, { recursive: true, force: true });
    }
    for (const k of ["AGENTS_DIR", "AGENT_RUNS_DIR", "APPROVALS_DIR", "POLICY_DIR"]) {
      delete process.env[k];
    }
    delete process.env.CLAUDE_BIN;
    delete process.env.FAKE_CLAUDE_DELETE;
  });

  it("pauses for approval, then deletes exactly the approved files in the granted dir", async () => {
    const target = await freshTarget();
    const start = await app
      .get(AgentRunnerService)
      .start("cleaner", "tidy up my workspace", "zibby-core", [target], "");
    const { runId, cwd } = start as { runId: string; cwd: string };

    // It pauses mid-run with a pending approval naming the deletion.
    await until(async () => ((await runStatus(runId)) === "awaiting-approval" ? true : null));
    const approval = await until(async () => (await pendingFor(runId)) ?? null);
    expect(approval.action).toBe("delete");
    expect(approval.risk).toBe("high");

    // The deletion list reached the card as enrichment JSON (a `command` preview).
    const enrichment = JSON.parse(approval.detail);
    expect(enrichment.riskType).toBe("delete");
    expect(enrichment.preview.kind).toBe("command");
    expect(enrichment.preview.targets.length).toBeGreaterThan(0);

    // Everything still present in the TARGET dir while we deliberate.
    expect(await exists(path.join(target, "scratch.tmp"))).toBe(true);
    expect(await exists(path.join(target, "report-final.txt"))).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/approvals/${approval.id}/approve`)
      .send({})
      .expect(200);

    await until(async () => ((await runStatus(runId)) === "done" ? true : null));

    // Junk and the duplicate are gone; the unique file + one copy survive.
    expect(await exists(path.join(target, "scratch.tmp"))).toBe(false);
    expect(await exists(path.join(target, "build.log"))).toBe(false);
    expect(await exists(path.join(target, "empty.txt"))).toBe(false);
    expect(await exists(path.join(target, ".DS_Store"))).toBe(false);
    expect(await exists(path.join(target, "report-final.txt"))).toBe(true);
    const copiesAfter = (await fs.readdir(target)).filter((f) => f.startsWith("report-copy"));
    expect(copiesAfter.length).toBe(1);

    // Gate coordination stayed in the sandbox — the target dir was never polluted.
    expect(await exists(path.join(target, "intent-request.json"))).toBe(false);
    expect(await exists(path.join(target, "intent-decision.json"))).toBe(false);
    expect(path.resolve(cwd)).not.toBe(path.resolve(target));

    await fs.rm(target, { recursive: true, force: true });
  });

  it("rejecting the deletion leaves every file untouched and interrupts the run", async () => {
    const target = await freshTarget();
    const start = await app
      .get(AgentRunnerService)
      .start("cleaner", "tidy up again", "zibby-core", [target], "");
    const { runId } = start as { runId: string };

    const approval = await until(async () => (await pendingFor(runId)) ?? null);
    await request(app.getHttpServer())
      .post(`/api/approvals/${approval.id}/reject`)
      .send({})
      .expect(200);

    await until(async () => ((await runStatus(runId)) === "interrupted" ? true : null));
    // Nothing was removed — the junk the agent proposed is all still there.
    expect(await exists(path.join(target, "scratch.tmp"))).toBe(true);
    expect(await exists(path.join(target, ".DS_Store"))).toBe(true);
    expect(await exists(path.join(target, "empty.txt"))).toBe(true);

    await fs.rm(target, { recursive: true, force: true });
  });
});
