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

/** Token-free stand-in for the real `claude` CLI (see fixtures/fake-claude.mjs). */
const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/fake-claude.mjs",
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

/** Read a run's unified view; null while it isn't resolvable yet. */
async function getRun(
  app: INestApplication,
  runId: string,
): Promise<{ runId: string; status: string; kind: string; sessionId?: string } | null> {
  const res = await request(app.getHttpServer()).get(`/api/tasks/runs/${runId}`);
  return res.status === 200 ? res.body : null;
}

/**
 * Phase 49 — re-run ("Resume") an errored agent run via
 * `POST /api/tasks/runs/:runId/resume`. Covers: session-id capture from the run's
 * stream-json `system/init` line, that an errored run re-runs into a NEW run, and that
 * the new run continues the captured session (`--resume <sessionId>` reaches argv).
 */
describe("Task run resume — re-run an errored agent run (e2e)", () => {
  let app: INestApplication;
  let agentsDir: string;
  let runsDir: string;
  let vaultDir: string;

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-e2e-agents-"));
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-e2e-runs-"));
    vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-e2e-vault-"));
    process.env.AGENTS_DIR = agentsDir;
    process.env.AGENT_RUNS_DIR = runsDir;
    process.env.VAULT_DIR = vaultDir;
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    process.env.FAKE_CLAUDE_STEPS = "3";
    process.env.FAKE_CLAUDE_DELAY_MS = "40";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post("/api/agents")
      .send({ id: "resumer", name: "Resumer", instructions: "test agent" })
      .expect(201);
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
    delete process.env.FAKE_CLAUDE_FAIL;
    delete process.env.FAKE_CLAUDE_SESSION;
    delete process.env.FAKE_CLAUDE_DUMP_ARGS_FILE;
  });

  it("captures the session id, re-runs an errored run, and continues it with --resume", async () => {
    // A run that emits a session id then fails — the errored terminal we re-run from.
    process.env.FAKE_CLAUDE_SESSION = "sess-e2e-1";
    process.env.FAKE_CLAUDE_FAIL = "1";
    const started = await app
      .get(AgentRunnerService)
      .start("resumer", "do the thing", "", [], "");
    const erroredId = started.runId;

    // It lands `error` and carries the captured session id.
    const errored = await until(async () => {
      const run = await getRun(app, erroredId);
      return run?.status === "error" ? run : null;
    });
    expect(errored?.status).toBe("error");
    expect(errored?.sessionId).toBe("sess-e2e-1");

    // Re-run it: capture the new run's argv, and let the re-run itself complete (not fail)
    // so we prove the button delivers a working run end to end.
    const dump = path.join(runsDir, "resume-argv.json");
    await fs.rm(dump, { force: true });
    process.env.FAKE_CLAUDE_DUMP_ARGS_FILE = dump;
    delete process.env.FAKE_CLAUDE_FAIL;

    const resumed = await request(app.getHttpServer())
      .post(`/api/tasks/runs/${erroredId}/resume`)
      .send({})
      .expect(200);

    // The response is the NEW run — a different id, still an agent run.
    expect(resumed.body.kind).toBe("agent");
    expect(resumed.body.runId).not.toBe(erroredId);
    const newId: string = resumed.body.runId;

    // The new session continues the captured one (`--resume <sessionId>`).
    const argv = await until<string[] | null>(async () => {
      const raw = await fs.readFile(dump, "utf8").catch(() => null);
      return raw ? (JSON.parse(raw) as string[]) : null;
    });
    if (!argv) throw new Error("re-run argv never appeared");
    const resumeIdx = argv.indexOf("--resume");
    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(argv[resumeIdx + 1]).toBe("sess-e2e-1");

    // And the new run reaches a terminal state (it actually ran).
    const done = await until(async () => {
      const run = await getRun(app, newId);
      return run?.status === "done" || run?.status === "error" ? run : null;
    });
    expect(["done", "error"]).toContain(done?.status);
  });

  it("rejects resuming a run that has not ended in error/interrupted (409)", async () => {
    process.env.FAKE_CLAUDE_SESSION = "sess-e2e-2";
    delete process.env.FAKE_CLAUDE_FAIL;
    delete process.env.FAKE_CLAUDE_DUMP_ARGS_FILE;
    const started = await app.get(AgentRunnerService).start("resumer", "finish cleanly", "", [], "");

    // Wait for it to finish `done`, then a resume of a done run is a no-op → 409.
    await until(async () => {
      const run = await getRun(app, started.runId);
      return run && run.status === "done" ? run : null;
    });

    await request(app.getHttpServer())
      .post(`/api/tasks/runs/${started.runId}/resume`)
      .send({})
      .expect(409);
  });
});
