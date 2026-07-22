import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SUBSYSTEMS } from "@zibby/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

/** Env vars this suite pins to its own isolated temp dir (never the shared `data-test` seed). */
const ISOLATED_ENV_VARS = [
  "AGENTS_DIR",
  "AGENT_RUNS_DIR",
  "PIPELINES_DIR",
  "INTEGRATIONS_DIR",
  "INTEGRATION_STATE_DIR",
  "CREDENTIALS_DIR",
] as const;

async function boot(): Promise<{ app: INestApplication; dir: string }> {
  // AppModule seeds several data dirs on init; isolate it so this suite never
  // touches the real `apps/api/data`. NS2 F1b also isolates pipelines/
  // integrations (previously only agents was isolated) — the shared
  // `data-test/` seed root carries pipeline fixtures with ids the owner-seed
  // rule table doesn't recognize (by design — unrelated to production ids),
  // which would leave them legitimately unowned and break the "empty fleet"
  // owner-backfill assertion below.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "subsystems-e2e-"));
  process.env.AGENTS_DIR = path.join(dir, "agents");
  process.env.AGENT_RUNS_DIR = path.join(dir, "runs");
  process.env.PIPELINES_DIR = path.join(dir, "pipelines");
  process.env.INTEGRATIONS_DIR = path.join(dir, "integrations");
  process.env.INTEGRATION_STATE_DIR = path.join(dir, "integration-state");
  process.env.CREDENTIALS_DIR = path.join(dir, "credentials");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, dir };
}

async function teardown(app: INestApplication, dir: string): Promise<void> {
  await app.close();
  await fs.rm(dir, { recursive: true, force: true });
  for (const key of ISOLATED_ENV_VARS) delete process.env[key];
}

describe("Subsystems API (e2e)", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    ({ app, dir } = await boot());
  });

  afterAll(async () => {
    await teardown(app, dir);
  });

  it("GET /api/subsystems lists all 11 in registry order with stub status", async () => {
    const res = await request(app.getHttpServer()).get("/api/subsystems");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(11);
    expect((res.body as Array<{ id: string }>).map((s) => s.id)).toEqual(
      SUBSYSTEMS.map((s) => s.id),
    );
    for (const subsystem of res.body as Array<{
      state: string;
      tier2Count: number;
      tier3Count: number;
    }>) {
      expect(subsystem).toMatchObject({ state: "idle", tier2Count: 0, tier3Count: 0 });
    }
  });

  it("GET /api/subsystems/:id returns the matching entry", async () => {
    const res = await request(app.getHttpServer()).get("/api/subsystems/forge");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "forge", name: "Forge", color: "#5b8def" });
  });

  it("GET /api/subsystems/:id 404s on an unknown id", async () => {
    const res = await request(app.getHttpServer()).get("/api/subsystems/nope");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message");
  });

  it("POST /api/subsystems/:id/seen acknowledges and returns the refreshed entry", async () => {
    const res = await request(app.getHttpServer()).post("/api/subsystems/forge/seen").send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "forge", state: "idle", tier2Count: 0, tier3Count: 0 });
  });

  it("POST /api/subsystems/:id/seen 404s on an unknown id", async () => {
    const res = await request(app.getHttpServer()).post("/api/subsystems/nope/seen").send({});
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message");
  });

  it("NS2 F1b: GET /api/subsystems/unowned is [] once the owner-backfill sweep has run (empty fleet)", async () => {
    const res = await request(app.getHttpServer()).get("/api/subsystems/unowned");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
