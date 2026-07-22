import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

/** Token-free stand-in for the real `claude` CLI (see fixtures/fake-claude.mjs). */
const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/fake-claude.mjs",
);

/**
 * B1 — the handoff signal-kind registry over HTTP (design doc
 * `docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md`,
 * Slot B → B1): GET returns the 7 seeded built-ins; POST registers a new
 * `pending` kind AND spawns a Forge-targeted build task (asserted by finding
 * the returned `buildTaskId` on `GET /api/tasks/scheduled`); DELETE of a
 * built-in is a 403. `AGENTS_DIR` is isolated with one Forge-owned active
 * agent seeded so the build-task dispatch has somewhere to route to
 * (mirrors `tasks.e2e.test.ts`'s `seedCatalog`).
 */
describe("Handoff signal-kinds API (e2e)", () => {
  let app: INestApplication;
  let agentsDir: string;
  let tasksDir: string;
  let signalKindsFile: string;

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "signal-kinds-agents-e2e-"));
    tasksDir = await fs.mkdtemp(path.join(os.tmpdir(), "signal-kinds-tasks-e2e-"));
    const skDir = await fs.mkdtemp(path.join(os.tmpdir(), "signal-kinds-file-e2e-"));
    signalKindsFile = path.join(skDir, "signal-kinds.json");
    process.env.AGENTS_DIR = agentsDir;
    process.env.TASKS_DIR = tasksDir;
    process.env.HANDOFF_SIGNAL_KINDS_FILE = signalKindsFile;
    // A build-task create spawns a run — use the token-free stub.
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    process.env.FAKE_CLAUDE_STEPS = "2";
    process.env.FAKE_CLAUDE_DELAY_MS = "30";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Forge needs SOMETHING to route the build task to (resolveSubsystemTarget
    // rejects a 0-owned subsystem) — one active Forge-owned agent is enough for
    // the single-owned-unit direct-dispatch path.
    await request(app.getHttpServer()).post("/api/agents").send({
      id: "forge-builder",
      name: "Forge Builder",
      category: "Vývoj",
      description: "Implementuje nové signály pro handoff.",
      instructions: "Implementuj producenty signálů.",
      ownerSubsystem: "forge",
    });
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(agentsDir, { recursive: true, force: true });
    await fs.rm(tasksDir, { recursive: true, force: true });
    await fs.rm(path.dirname(signalKindsFile), { recursive: true, force: true });
    for (const k of [
      "AGENTS_DIR",
      "TASKS_DIR",
      "HANDOFF_SIGNAL_KINDS_FILE",
      "CLAUDE_BIN",
      "FAKE_CLAUDE_STEPS",
      "FAKE_CLAUDE_DELAY_MS",
    ]) {
      delete process.env[k];
    }
  });

  const server = () => app.getHttpServer();

  it("GET /api/handoff-signal-kinds returns the 7 seeded built-ins", async () => {
    const res = await request(server()).get("/api/handoff-signal-kinds").expect(200);
    expect(res.body).toHaveLength(7);
    expect(res.body.map((k: { id: string }) => k.id).sort()).toEqual(
      [
        "community",
        "cve",
        "cycle",
        "god-node",
        "post-merge-red",
        "research-artifact",
        "secret",
      ].sort(),
    );
    expect(
      res.body.every(
        (k: { status: string; system: boolean }) => k.status === "builtin" && k.system,
      ),
    ).toBe(true);
  });

  it("POST /api/handoff-signal-kinds registers a pending kind and spawns a Forge build task", async () => {
    const res = await request(server())
      .post("/api/handoff-signal-kinds")
      .send({
        from: "beacon",
        label: "Dependency Outdated",
        description: "A dependency has fallen behind its latest release.",
        severityBearing: false,
      })
      .expect(201);

    expect(res.body.signalKind).toMatchObject({
      id: "dependency-outdated",
      from: "beacon",
      status: "pending",
      system: false,
    });
    expect(res.body.buildTaskId).toBeTruthy();
    expect(res.body.signalKind.buildTaskId).toBe(res.body.buildTaskId);

    // The build task exists and was scheduled — status transitions off the
    // response path, so poll for it rather than asserting an exact status.
    const found = await until(async () => {
      const scheduled = await request(server()).get("/api/tasks/scheduled").expect(200);
      return (scheduled.body as Array<{ id: string; title?: string }>).find(
        (t) => t.id === res.body.buildTaskId,
      );
    });
    expect(found?.title).toContain("dependency-outdated");

    // GET reflects the newly-registered kind alongside the 7 built-ins.
    const list = await request(server()).get("/api/handoff-signal-kinds").expect(200);
    expect(list.body).toHaveLength(8);
    expect(list.body.find((k: { id: string }) => k.id === "dependency-outdated")?.buildTaskId).toBe(
      res.body.buildTaskId,
    );
  });

  it("PATCH /api/handoff-signal-kinds/:id returns 403 for a built-in kind", async () => {
    await request(server())
      .patch("/api/handoff-signal-kinds/cve")
      .send({
        from: "sentinel",
        label: "Vulnerability (CVE)",
        description: "changed",
        severityBearing: true,
      })
      .expect(403);
  });

  it("DELETE /api/handoff-signal-kinds/:id returns 403 for a built-in kind", async () => {
    await request(server()).delete("/api/handoff-signal-kinds/cve").expect(403);
  });

  it("DELETE /api/handoff-signal-kinds/:id returns 404 for an unknown id", async () => {
    await request(server()).delete("/api/handoff-signal-kinds/does-not-exist").expect(404);
  });
});

async function until<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out");
    await new Promise((r) => setTimeout(r, 40));
  }
}
