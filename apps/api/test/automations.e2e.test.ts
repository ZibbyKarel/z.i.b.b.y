import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { SchedulerService } from "../src/automations/scheduler.service";

const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/fake-claude.mjs",
);

describe("Automations API (e2e)", () => {
  let app: INestApplication;
  const dirs: Record<string, string> = {};

  beforeAll(async () => {
    for (const key of ["AGENTS_DIR", "AGENT_RUNS_DIR", "AUTOMATIONS_DIR", "APPROVALS_DIR"]) {
      dirs[key] = await fs.mkdtemp(path.join(os.tmpdir(), `auto-${key}-`));
      process.env[key] = dirs[key];
    }
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    process.env.FAKE_CLAUDE_STEPS = "2";
    process.env.FAKE_CLAUDE_DELAY_MS = "30";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post("/api/agents")
      .send({ id: "briefer", name: "Briefer", instructions: "writes the briefing" })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    for (const d of Object.values(dirs)) await fs.rm(d, { recursive: true, force: true });
    for (const k of [
      "AGENTS_DIR",
      "AGENT_RUNS_DIR",
      "AUTOMATIONS_DIR",
      "APPROVALS_DIR",
      "CLAUDE_BIN",
      "FAKE_CLAUDE_STEPS",
      "FAKE_CLAUDE_DELAY_MS",
    ]) {
      delete process.env[k];
    }
  });

  it("creates an automation and triggering it starts the target agent run", async () => {
    await request(app.getHttpServer())
      .post("/api/automations")
      .send({
        id: "morning",
        name: "Morning briefing",
        trigger: { type: "cron", expr: "* * * * *" },
        target: { type: "agent", agentId: "briefer", prompt: "summarise overnight" },
        enabled: true,
      })
      .expect(201);

    const fired = await request(app.getHttpServer())
      .post("/api/automations/morning/trigger")
      .send({})
      .expect(200);
    const runRef = fired.body.runRef;
    expect(typeof runRef).toBe("string");

    // The agent run exists.
    await request(app.getHttpServer()).get(`/api/tasks/runs/${runRef}`).expect(200);
  });

  it("the scheduler tick fires a due automation once per minute (idempotent)", async () => {
    const scheduler = app.get(SchedulerService);
    // A distinct minute from the manual trigger above (which already stamped
    // lastFiredAt this minute), so the only thing under test is tick idempotence.
    const now = new Date(Date.now() + 90_000);
    const first = await scheduler.tick(now);
    expect(first).toContain("morning");
    // Same wall minute → does not fire again.
    const second = await scheduler.tick(now);
    expect(second).not.toContain("morning");
  });

  it("a disabled automation does not fire", async () => {
    await request(app.getHttpServer())
      .patch("/api/automations/morning")
      .send({ enabled: false })
      .expect(200);
    const scheduler = app.get(SchedulerService);
    // A minute later so the idempotence guard isn't what's stopping it.
    const fired = await scheduler.tick(new Date(Date.now() + 120_000));
    expect(fired).not.toContain("morning");
  });

  it("404s on triggering an unknown automation", async () => {
    await request(app.getHttpServer()).post("/api/automations/ghost/trigger").send({}).expect(404);
  });

  it("searches automations by id/name without colliding with /:id", async () => {
    // The "morning" automation created earlier matches by name.
    const hits = await request(app.getHttpServer())
      .get("/api/automations/search?q=morning")
      .expect(200);
    expect(hits.body.map((a: { id: string }) => a.id)).toContain("morning");

    // "/search" resolves to the search route, never to GET /automations/:id (→ 404).
    const empty = await request(app.getHttpServer())
      .get("/api/automations/search?q=zzz-none")
      .expect(200);
    expect(empty.body).toEqual([]);
  });
});
