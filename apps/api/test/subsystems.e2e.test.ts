import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SUBSYSTEMS } from "@zibby/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

async function boot(): Promise<{ app: INestApplication; dir: string }> {
  // AppModule seeds several data dirs on init; isolate it so this suite never
  // touches the real `apps/api/data`.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "subsystems-e2e-"));
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

  it("GET /api/subsystems lists all 8 in registry order with stub status", async () => {
    const res = await request(app.getHttpServer()).get("/api/subsystems");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    expect((res.body as Array<{ id: string }>).map((s) => s.id)).toEqual(
      SUBSYSTEMS.map((s) => s.id),
    );
    for (const subsystem of res.body as Array<{
      state: string;
      tier2Count: number;
      tier3Count: number;
    }>) {
      expect(subsystem).toMatchObject({ state: "klid", tier2Count: 0, tier3Count: 0 });
    }
  });

  it("GET /api/subsystems/:id returns the matching entry", async () => {
    const res = await request(app.getHttpServer()).get("/api/subsystems/forge");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "forge", name: "Forge", color: "#f97316" });
  });

  it("GET /api/subsystems/:id 404s on an unknown id", async () => {
    const res = await request(app.getHttpServer()).get("/api/subsystems/nope");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message");
  });
});
