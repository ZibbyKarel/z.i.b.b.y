import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgentRunnerService } from "../agents/agent-runner.service";
import { AppModule } from "../app.module";

/** Token-free stand-in for the real `claude` CLI (see fixtures/fake-claude.mjs). */
const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures/fake-claude.mjs",
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll `fn` until it returns a truthy value or the timeout elapses. */
async function until<T>(fn: () => Promise<T>, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out");
    await sleep(50);
  }
}

/**
 * Phase 126e — reproduces (and then guards against) the `/archiv` 404: real Express
 * route resolution over `/api/tasks/runs/*`, not the mocked API client every other
 * archive test uses (which is exactly why none of them caught this). Boots the FULL
 * `AppModule` (mirrors `task-run-resume.e2e.test.ts`) so the contract's actual key
 * order determines actual route registration, then spawns one real agent run through
 * the fake-claude CLI to have a genuine archived (`done`) run to assert against.
 */
describe("GET /api/tasks/runs/archive — route-ordering regression (Phase 126e)", () => {
  let app: INestApplication;
  let agentsDir: string;
  let runsDir: string;
  let vaultDir: string;
  let doneRunId: string;

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "archive-route-e2e-agents-"));
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "archive-route-e2e-runs-"));
    vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "archive-route-e2e-vault-"));
    process.env.AGENTS_DIR = agentsDir;
    process.env.AGENT_RUNS_DIR = runsDir;
    process.env.VAULT_DIR = vaultDir;
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    process.env.FAKE_CLAUDE_STEPS = "1";
    process.env.FAKE_CLAUDE_DELAY_MS = "20";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post("/api/agents")
      .send({
        id: "archive-route-agent",
        name: "Archive Route Agent",
        instructions: "test agent",
        ownerSubsystem: "forge",
      })
      .expect(201);

    // A real run that reaches a terminal (archived) state, so the archive endpoint
    // has genuine content to return and `getTaskRun` has a genuine id to resolve.
    const started = await app
      .get(AgentRunnerService)
      .start("archive-route-agent", "finish cleanly", "", [], "");
    doneRunId = started.runId;
    await until(async () => {
      const res = await request(app.getHttpServer()).get(`/api/tasks/runs/${doneRunId}`);
      return res.status === 200 && res.body.status === "done" ? res.body : null;
    });
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(agentsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    await fs.rm(runsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    await fs.rm(vaultDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    delete process.env.AGENTS_DIR;
    delete process.env.AGENT_RUNS_DIR;
    delete process.env.VAULT_DIR;
    delete process.env.CLAUDE_BIN;
    delete process.env.FAKE_CLAUDE_STEPS;
    delete process.env.FAKE_CLAUDE_DELAY_MS;
  });

  it("resolves to the archive handler, not the `:runId` param route (200, not 404)", async () => {
    // Before the fix, `getTaskRun`'s `/tasks/runs/:runId` is registered first and
    // swallows this request with `runId = "archive"`, 404-ing with the message
    // below. This is the primary assertion — it must fail against the pre-fix
    // contract order and pass once `listArchivedTaskRuns` is reordered above it.
    const res = await request(app.getHttpServer()).get("/api/tasks/runs/archive");
    expect(res.status).toBe(200);
    expect(res.body).not.toEqual(
      expect.objectContaining({ message: expect.stringContaining('"archive" not found') }),
    );
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.some((r: { runId: string }) => r.runId === doneRunId)).toBe(true);
  });

  it("still serves /archive/counts (the sibling that survived only by accident)", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/tasks/runs/archive/counts")
      .expect(200);
    expect(typeof res.body.total).toBe("number");
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it("still resolves a real run id — the reorder must not break the :runId route", async () => {
    const res = await request(app.getHttpServer()).get(`/api/tasks/runs/${doneRunId}`).expect(200);
    expect(res.body.runId).toBe(doneRunId);
  });

  it("still 404s an unknown run id with the run-not-found message", async () => {
    const res = await request(app.getHttpServer()).get("/api/tasks/runs/definitely-not-a-run");
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Task run "definitely-not-a-run" not found');
  });
});
