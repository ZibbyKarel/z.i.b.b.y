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
import { WatcherHealthRegistry } from "../src/health/watcher-health.registry";
import { ClaudeUnavailableError } from "../src/runner/claude-preflight.service";

/** Token-free stand-in for the real `claude` CLI (see fixtures/fake-claude.mjs). */
const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/fake-claude.mjs",
);

async function boot(): Promise<{ app: INestApplication; dir: string }> {
  // AppModule seeds the agents data dir on init; isolate it so this suite never
  // touches the real `apps/api/data/agents`.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "health-e2e-"));
  process.env.AGENTS_DIR = path.join(dir, "agents");
  process.env.AGENT_RUNS_DIR = path.join(dir, "runs");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, dir };
}

async function teardown(app: INestApplication, dir: string): Promise<void> {
  await app.close();
  await fs.rm(dir, { recursive: true, force: true });
  delete process.env.AGENTS_DIR;
  delete process.env.AGENT_RUNS_DIR;
  delete process.env.CLAUDE_BIN;
}

describe("Health API (e2e) — claude available", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    ({ app, dir } = await boot());
  });

  afterAll(async () => {
    await teardown(app, dir);
  });

  it("reports ok with uptime, an ISO timestamp and the claude version", async () => {
    const res = await request(app.getHttpServer()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
    expect(res.body.claude).toMatchObject({ ok: true });
    expect(res.body.claude.version).toContain("fake-claude");
  });

  it("carries watchers[] with every heartbeat id self-registered (F6c)", async () => {
    const res = await request(app.getHttpServer()).get("/api/health").expect(200);
    const watchers = res.body.watchers as Array<{ id: string; status: string }>;
    // Exhaustive on purpose: a new ticker that forgets to self-register is invisible
    // to /api/health, so this list is meant to be updated deliberately when one is
    // added — `roadmap` (phase 125h) is the auto-sync + gate-poll tick.
    expect(watchers.map((w) => w.id).sort()).toEqual([
      "channel",
      "limit-resume",
      "monitor",
      "roadmap",
      "scheduler",
      "task-scheduler",
    ]);
    for (const w of watchers) expect(["ok", "stale", "disabled"]).toContain(w.status);
  });

  it("a stale watcher never flips the overall status to degraded (fail-open, F6c)", async () => {
    // Register an extra, deliberately-stale probe straight into the registry —
    // the overall status must stay governed by claude + subsystems only.
    app.get(WatcherHealthRegistry).register(() => ({
      id: "channel",
      status: "stale",
      tickMs: 1000,
      lastTickAt: "2026-01-01T00:00:00.000Z",
      ageMs: 999_999,
    }));
    const res = await request(app.getHttpServer()).get("/api/health").expect(200);
    expect((res.body.watchers as Array<{ status: string }>).some((w) => w.status === "stale")).toBe(
      true,
    );
    expect(res.body.status).toBe("ok");
  });
});

describe("Health API (e2e) — claude unavailable", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    process.env.CLAUDE_BIN = "/nonexistent/claude-bin";
    ({ app, dir } = await boot());
  });

  afterAll(async () => {
    await teardown(app, dir);
  });

  it("degrades the status and carries the failure reason", async () => {
    const res = await request(app.getHttpServer()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("degraded");
    expect(res.body.claude).toMatchObject({ ok: false, reason: "missing" });
  });

  it("refuses an agent run start with a 503 (no dead run record)", async () => {
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({
        id: "preflight-probe",
        name: "Preflight probe",
        instructions: "noop",
        ownerSubsystem: "forge",
      })
      .expect(201);

    // Start now goes through the service, which throws ClaudeUnavailableError when the
    // CLI preflight fails (the controller surfaced that as a 503) — and crucially does
    // so BEFORE writing any run record.
    await expect(
      app.get(AgentRunnerService).start("preflight-probe", "do nothing", "", [], ""),
    ).rejects.toBeInstanceOf(ClaudeUnavailableError);

    // The refusal happened before any run record was created.
    const runs = await request(app.getHttpServer()).get("/api/tasks/runs").expect(200);
    expect((runs.body as Array<{ kind: string }>).filter((r) => r.kind === "agent")).toEqual([]);
  });
});
