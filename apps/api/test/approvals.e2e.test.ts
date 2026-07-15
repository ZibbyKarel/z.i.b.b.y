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

const fileExists = (p: string) =>
  fs
    .access(p)
    .then(() => true)
    .catch(() => false);

/** The benign marker the stub always writes; not the gated action. */
const benignMarker = (cwd: string) => fileExists(path.join(cwd, "agent-007-was-here.txt"));
/** The gated external effect — written only once an INTENT is allowed. */
const paymentDone = (cwd: string) => fileExists(path.join(cwd, "payment-done.txt"));

/** An INTENT that trips a `purchase.amount > 500` threshold and the floor's `payment` rule. */
const PAYMENT_INTENT = JSON.stringify({ action: "payment", metrics: { "purchase.amount": 1200 } });
/** An INTENT no rule (nor the floor) matches at all → evaluates to `ask` (Task 2,
 * claim 3: the "nothing matched" default is fail-closed, not fail-open). */
const BENIGN_INTENT = JSON.stringify({ action: "add_to_cart", metrics: { "purchase.amount": 50 } });

describe("Mid-run approval gate (Variant B, e2e)", () => {
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const fresh = moduleRef.createNestApplication();
    await fresh.init();
    return fresh;
  }

  async function startRun(agentId: string, prompt: string) {
    return (await app.get(AgentRunnerService).start(agentId, prompt, "zibby-core", [], "")) as {
      runId: string;
      cwd: string;
      status: string;
    };
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

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "appr-agents-"));
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "appr-runs-"));
    approvalsDir = await fs.mkdtemp(path.join(os.tmpdir(), "appr-store-"));
    policyDir = await fs.mkdtemp(path.join(os.tmpdir(), "appr-policy-"));
    process.env.FAKE_CLAUDE_STEPS = "4";
    process.env.FAKE_CLAUDE_DELAY_MS = "40";
    app = await boot();

    // A threshold gate: pause when a purchase tops 500.
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({
        id: "payer",
        name: "Payer",
        instructions: "buys things",
        risk: "high",
        gates: [
          {
            match: [{ type: "threshold", metric: "purchase.amount", op: "gt", value: 500 }],
            decision: "ask",
            resolve: { type: "human" },
          },
        ],
      })
      .expect(201);

    // A deny gate: payments are categorically refused.
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({
        id: "denier",
        name: "Denier",
        instructions: "must not pay",
        gates: [{ match: [{ type: "action", action: "payment" }], decision: "deny" }],
      })
      .expect(201);

    // No gates: benign actions run unimpeded.
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({ id: "free", name: "Free", instructions: "browses" })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    for (const d of [agentsDir, runsDir, approvalsDir, policyDir]) {
      await fs.rm(d, { recursive: true, force: true });
    }
    for (const k of [
      "AGENTS_DIR",
      "AGENT_RUNS_DIR",
      "APPROVALS_DIR",
      "POLICY_DIR",
      "CLAUDE_BIN",
      "FAKE_CLAUDE_STEPS",
      "FAKE_CLAUDE_DELAY_MS",
      "FAKE_CLAUDE_INTENT",
    ]) {
      delete process.env[k];
    }
  });

  it("pauses mid-run on an intent that matches no rule at all (claim 3 — fail-closed default), then resumes to done on approve", async () => {
    process.env.FAKE_CLAUDE_INTENT = BENIGN_INTENT;
    const { runId, cwd } = await startRun("free", "browse the catalog");

    // Genuinely unmatched (no own rule, no floor rule) now defaults to `ask`, not
    // `allow` — the run pauses instead of silently completing the gated action.
    await until(async () => ((await runStatus(runId)) === "awaiting-approval" ? true : null));
    expect(await benignMarker(cwd)).toBe(true);
    expect(await paymentDone(cwd)).toBe(false);

    const approval = await until(async () => (await pendingFor(runId)) ?? null);
    expect(approval.action).toBe("add_to_cart");

    await request(app.getHttpServer())
      .post(`/api/approvals/${approval.id}/approve`)
      .send({})
      .expect(200);

    await until(async () => ((await runStatus(runId)) === "done" ? true : null));
    expect(await paymentDone(cwd)).toBe(true);
  });

  it("pauses mid-run on a threshold intent, then resumes to done on approve", async () => {
    process.env.FAKE_CLAUDE_INTENT = PAYMENT_INTENT;
    const { runId, cwd } = await startRun("payer", "buy the expensive thing");

    // It spawned and did benign work, then paused at the gate — payment not yet made.
    await until(async () => ((await runStatus(runId)) === "awaiting-approval" ? true : null));
    expect(await benignMarker(cwd)).toBe(true);
    expect(await paymentDone(cwd)).toBe(false);

    const approval = await until(async () => (await pendingFor(runId)) ?? null);
    expect(approval.action).toBe("payment");
    expect(approval.risk).toBe("high");

    await request(app.getHttpServer())
      .post(`/api/approvals/${approval.id}/approve`)
      .send({})
      .expect(200);

    await until(async () => ((await runStatus(runId)) === "done" ? true : null));
    expect(await paymentDone(cwd)).toBe(true);
  });

  it("rejecting a paused mid-run intent interrupts the run without performing the action", async () => {
    process.env.FAKE_CLAUDE_INTENT = PAYMENT_INTENT;
    const { runId, cwd } = await startRun("payer", "nope");

    const approval = await until(async () => (await pendingFor(runId)) ?? null);
    await request(app.getHttpServer())
      .post(`/api/approvals/${approval.id}/reject`)
      .send({})
      .expect(200);

    await until(async () => ((await runStatus(runId)) === "interrupted" ? true : null));
    expect(await paymentDone(cwd)).toBe(false);

    // Deciding again is a 409.
    await request(app.getHttpServer())
      .post(`/api/approvals/${approval.id}/reject`)
      .send({})
      .expect(409);
  });

  it("a deny rule aborts the action mid-run with no human in the loop", async () => {
    process.env.FAKE_CLAUDE_INTENT = PAYMENT_INTENT;
    const { runId, cwd } = await startRun("denier", "try to pay");

    await until(async () => ((await runStatus(runId)) === "interrupted" ? true : null));
    expect(await paymentDone(cwd)).toBe(false);
    // No approval was ever raised — the policy refused it outright.
    expect(await pendingFor(runId)).toBeUndefined();
  });

  it("the floor gates a git.push (no agent rule) — parks, approve releases it", async () => {
    // The gateless `free` agent: only the locked floor applies. git.push → ask.
    process.env.FAKE_CLAUDE_INTENT = JSON.stringify({ action: "git.push", branch: "main" });
    const { runId, cwd } = await startRun("free", "push my branch");

    await until(async () => ((await runStatus(runId)) === "awaiting-approval" ? true : null));
    const approval = await until(async () => (await pendingFor(runId)) ?? null);
    expect(approval.action).toBe("git.push");
    // The push hasn't happened yet (the receipt is the gated effect).
    expect(await paymentDone(cwd)).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/approvals/${approval.id}/approve`)
      .send({})
      .expect(200);
    await until(async () => ((await runStatus(runId)) === "done" ? true : null));
    expect(await paymentDone(cwd)).toBe(true);
  });

  it("the floor denies pr.merge outright — interrupted, no approval, no effect", async () => {
    // pr.merge is a locked `deny` on the floor: refused with no human in the loop.
    process.env.FAKE_CLAUDE_INTENT = JSON.stringify({ action: "pr.merge" });
    const { runId, cwd } = await startRun("free", "merge it");

    await until(async () => ((await runStatus(runId)) === "interrupted" ? true : null));
    expect(await paymentDone(cwd)).toBe(false);
    expect(await pendingFor(runId)).toBeUndefined();
  });
});

describe("Mid-run pause is not durable across restart (e2e)", () => {
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const fresh = moduleRef.createNestApplication();
    await fresh.init();
    return fresh;
  }

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "appr2-agents-"));
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "appr2-runs-"));
    approvalsDir = await fs.mkdtemp(path.join(os.tmpdir(), "appr2-store-"));
    policyDir = await fs.mkdtemp(path.join(os.tmpdir(), "appr2-policy-"));
  });

  afterAll(async () => {
    for (const d of [agentsDir, runsDir, approvalsDir, policyDir]) {
      await fs.rm(d, { recursive: true, force: true });
    }
    for (const k of [
      "AGENTS_DIR",
      "AGENT_RUNS_DIR",
      "APPROVALS_DIR",
      "POLICY_DIR",
      "CLAUDE_BIN",
      "FAKE_CLAUDE_STEPS",
      "FAKE_CLAUDE_DELAY_MS",
      "FAKE_CLAUDE_INTENT",
    ]) {
      delete process.env[k];
    }
  });

  it("a run paused mid-run becomes interrupted after a restart (its blocking child is gone)", async () => {
    process.env.FAKE_CLAUDE_STEPS = "4";
    process.env.FAKE_CLAUDE_DELAY_MS = "40";
    process.env.FAKE_CLAUDE_INTENT = JSON.stringify({
      action: "payment",
      metrics: { "purchase.amount": 1200 },
    });

    const app1 = await boot();
    await request(app1.getHttpServer())
      .post("/api/agents")
      .send({
        id: "payer",
        name: "Payer",
        instructions: "buys things",
        gates: [
          {
            match: [{ type: "threshold", metric: "purchase.amount", op: "gt", value: 500 }],
            decision: "ask",
            resolve: { type: "human" },
          },
        ],
      })
      .expect(201);
    const start = await app1.get(AgentRunnerService).start("payer", "later", "zibby-core", [], "");
    const { runId } = start;

    // Wait until it has actually paused mid-run before tearing the backend down.
    await until(async () => {
      const res = await request(app1.getHttpServer()).get(`/api/tasks/runs/${runId}`);
      return res.body.status === "awaiting-approval" ? true : null;
    });
    await app1.close();

    // Restart: the mid-run child died with the old backend and no spawn spec was
    // stashed, so the run is reconciled to interrupted — not resumable.
    const app2 = await boot();
    const run = await request(app2.getHttpServer()).get(`/api/tasks/runs/${runId}`).expect(200);
    expect(run.body.status).toBe("interrupted");
    await app2.close();
  });
});
