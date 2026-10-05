import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DEPARTMENT_SEED } from "@zibby/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

/** Env vars this suite pins to its own isolated temp dir (never the shared `data-test` seed). */
const ISOLATED_ENV_VARS = [
  "AGENTS_DIR",
  "AGENT_RUNS_DIR",
  "WORKFLOWS_DIR",
  "INTEGRATIONS_DIR",
  "INTEGRATION_STATE_DIR",
  "CREDENTIALS_DIR",
  "DEPARTMENTS_DIR",
  "RUN_READ_FILE",
] as const;

async function boot(): Promise<{ app: INestApplication; dir: string }> {
  // AppModule seeds several data dirs on init; isolate it so this suite never
  // touches the real `apps/api/data`. NS2 F1b also isolates workflows/
  // integrations (previously only agents was isolated) — the shared
  // `data-test/` seed root carries workflow fixtures with ids the owner-seed
  // rule table doesn't recognize (by design — unrelated to production ids),
  // which would leave them legitimately unowned and break the "empty fleet"
  // owner-backfill assertion below.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "departments-e2e-"));
  process.env.AGENTS_DIR = path.join(dir, "agents");
  process.env.AGENT_RUNS_DIR = path.join(dir, "runs");
  process.env.WORKFLOWS_DIR = path.join(dir, "workflows");
  process.env.INTEGRATIONS_DIR = path.join(dir, "integrations");
  process.env.INTEGRATION_STATE_DIR = path.join(dir, "integration-state");
  process.env.CREDENTIALS_DIR = path.join(dir, "credentials");
  // D-022: an empty dir proves the store seeds itself on first boot.
  process.env.DEPARTMENTS_DIR = path.join(dir, "departments");
  process.env.RUN_READ_FILE = path.join(dir, "run-read.json");
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

describe("Departments API (e2e)", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    ({ app, dir } = await boot());
  });

  afterAll(async () => {
    await teardown(app, dir);
  });

  it("GET /api/departments lists all 11 in registry order with stub status", async () => {
    const res = await request(app.getHttpServer()).get("/api/departments");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(11);
    expect((res.body as Array<{ id: string }>).map((s) => s.id)).toEqual(
      DEPARTMENT_SEED.map((s) => s.id),
    );
    for (const department of res.body as Array<{
      state: string;
      tier2Count: number;
      tier3Count: number;
    }>) {
      expect(department).toMatchObject({ state: "idle", tier2Count: 0, tier3Count: 0 });
    }
  });

  it("GET /api/departments/:id returns the matching entry", async () => {
    const res = await request(app.getHttpServer()).get("/api/departments/dev");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "dev", name: "Development", color: "#5b8def" });
  });

  it("GET /api/departments/:id 404s on an unknown id", async () => {
    const res = await request(app.getHttpServer()).get("/api/departments/nope");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message");
  });

  it("POST /api/departments/:id/seen acknowledges and returns the refreshed entry", async () => {
    const res = await request(app.getHttpServer()).post("/api/departments/dev/seen").send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "dev", state: "idle", tier2Count: 0, tier3Count: 0 });
  });

  it("GET /api/notifications is empty on a fresh install; POST /api/notifications/read marks all", async () => {
    const list = await request(app.getHttpServer()).get("/api/notifications");
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    const read = await request(app.getHttpServer()).post("/api/notifications/read").send({});
    expect(read.status).toBe(200);
    expect(read.body).toEqual([]);
  });

  it("POST /api/departments/:id/seen 404s on an unknown id", async () => {
    const res = await request(app.getHttpServer()).post("/api/departments/nope/seen").send({});
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message");
  });

  it("NS2 F1b: GET /api/departments/unowned is [] once the owner-backfill sweep has run (empty fleet)", async () => {
    const res = await request(app.getHttpServer()).get("/api/departments/unowned");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("D-022: seeds the 11 departments + 4 divisions into an empty dir on first boot", async () => {
    const files = await fs.readdir(path.join(dir, "departments"));
    expect(files.filter((f) => f.endsWith(".json") && !f.startsWith("_"))).toHaveLength(11);
    expect(files).toContain("_divisions.json");
    const res = await request(app.getHttpServer()).get("/api/departments/divisions");
    expect(res.status).toBe(200);
    expect((res.body as Array<{ id: string }>).map((d) => d.id)).toEqual([
      "engineering",
      "operations",
      "business",
      "office",
    ]);
  });

  it("D-022: POST /api/departments creates `pub` (201), it is listed with an empty roster, a duplicate is 409", async () => {
    const body = {
      id: "pub",
      code: "PUB",
      name: "Publishing",
      tagline: "Knihy a produkty",
      mandate: "Výroba a prodej digitálních produktů.",
      color: "#22aa88",
      division: "business",
      icon: "book",
      fallback: "primary",
      tierDefault: null,
    };
    const created = await request(app.getHttpServer()).post("/api/departments").send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: "pub", icon: "book" });
    expect(typeof created.body.createdAt).toBe("string");

    const list = await request(app.getHttpServer()).get("/api/departments");
    const ids = (list.body as Array<{ id: string }>).map((d) => d.id);
    expect(ids).toHaveLength(12);
    expect(ids).toContain("pub");

    const roster = await request(app.getHttpServer()).get("/api/departments/pub/roster");
    expect(roster.status).toBe(200);
    expect(roster.body).toEqual({ agents: [], integrations: [], monitors: [] });

    const dup = await request(app.getHttpServer()).post("/api/departments").send(body);
    expect(dup.status).toBe(409);
  });

  it("D-022: POST /api/departments rejects a malformed id (400) and an unknown division (422)", async () => {
    const base = {
      code: "XYZ",
      name: "X",
      tagline: "",
      mandate: "",
      color: "#112233",
      division: "business",
    };
    const badId = await request(app.getHttpServer())
      .post("/api/departments")
      .send({ ...base, id: "Bad Id" });
    // Schema-invalid bodies are rejected by ts-rest's body validation (400) like every
    // other route; 422 is reserved for the semantic "division does not exist".
    expect(badId.status).toBe(400);
    const badDivision = await request(app.getHttpServer())
      .post("/api/departments")
      .send({ ...base, id: "xyz", division: "nope" });
    expect(badDivision.status).toBe(422);
  });

  it("D-022: PATCH /api/departments/:id edits fields (id immutable), 404 unknown, 422 unknown division", async () => {
    const ok = await request(app.getHttpServer())
      .patch("/api/departments/pub")
      .send({ name: "Publishing House", tierDefault: "ask" });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ id: "pub", name: "Publishing House", tierDefault: "ask" });
    const missing = await request(app.getHttpServer())
      .patch("/api/departments/ghost")
      .send({ name: "x" });
    expect(missing.status).toBe(404);
    const badDivision = await request(app.getHttpServer())
      .patch("/api/departments/pub")
      .send({ division: "nope" });
    expect(badDivision.status).toBe(422);
  });

  it("D-022: hiring into an unknown department is 404", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/departments/ghost-dept/employees")
      .send({ agentId: "koder" });
    expect(res.status).toBe(404);
  });

  it("D-022: a gate rule tagged with an unknown department is 422", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/gate-rules")
      .send({
        name: "x",
        match: [{ type: "action", action: "deploy" }],
        decision: "deny",
        department: "ghost-dept",
      });
    expect(res.status).toBe(422);
  });
});
