import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

const BASE = "/api/teams";
const PROJECTS_BASE = "/api/projects";

describe("Teams API (e2e)", () => {
  let app: INestApplication;
  let dir: string;
  let projectsDir: string;

  const team = { id: "devrel", name: "DevRel", desc: "A test team" };

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "teams-e2e-"));
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "teams-e2e-projects-"));
    process.env.TEAMS_DIR = dir;
    process.env.PROJECTS_DIR = projectsDir;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(projectsDir, { recursive: true, force: true });
    delete process.env.TEAMS_DIR;
    delete process.env.PROJECTS_DIR;
  });

  it("starts empty", async () => {
    expect((await request(app.getHttpServer()).get(BASE)).body).toEqual([]);
  });

  it("creates, reads, updates and deletes a team", async () => {
    const created = await request(app.getHttpServer()).post(BASE).send(team);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject(team);

    await request(app.getHttpServer()).get(`${BASE}/devrel`).expect(200);

    const updated = await request(app.getHttpServer())
      .patch(`${BASE}/devrel`)
      .send({ desc: "renamed" });
    expect(updated.body.desc).toBe("renamed");

    await request(app.getHttpServer()).delete(`${BASE}/devrel`).expect(200);
    await request(app.getHttpServer()).get(`${BASE}/devrel`).expect(404);
  });

  it("rejects a duplicate id (409) and an invalid body (400)", async () => {
    await request(app.getHttpServer()).post(BASE).send(team).expect(201);
    await request(app.getHttpServer()).post(BASE).send(team).expect(409);
    // Missing required `name` → contract 400.
    await request(app.getHttpServer()).post(BASE).send({ id: "x" }).expect(400);
    await request(app.getHttpServer()).delete(`${BASE}/devrel`).expect(200);
  });

  it("404s on getting a missing team", async () => {
    await request(app.getHttpServer()).get(`${BASE}/nope`).expect(404);
  });

  it("searches teams by id/name/desc without colliding with /:id", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "growth", name: "Growth", desc: "Acquisition & retention" })
      .expect(201);

    const hits = await request(app.getHttpServer()).get(`${BASE}/search?q=growth`).expect(200);
    expect(hits.body.map((t: { id: string }) => t.id)).toEqual(["growth"]);

    // "/search" resolves to the search route, never to GET /teams/:id (→ 404).
    const empty = await request(app.getHttpServer()).get(`${BASE}/search?q=zzz`).expect(200);
    expect(empty.body).toEqual([]);

    await request(app.getHttpServer()).delete(`${BASE}/growth`).expect(200);
  });

  it("deletes a team a project links to, leaving the project with a dangling teamId (no cascade)", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "platform", name: "Platform" })
      .expect(201);

    await request(app.getHttpServer())
      .post(PROJECTS_BASE)
      .send({ id: "widget-app", name: "widget-app", path: "~/p/widget-app", teamId: "platform" })
      .expect(201);

    await request(app.getHttpServer()).delete(`${BASE}/platform`).expect(200);
    await request(app.getHttpServer()).get(`${BASE}/platform`).expect(404);

    // The project keeps its now-dangling teamId; a project with no team must
    // behave exactly as today (mirrors the companyId no-cascade decision).
    const got = await request(app.getHttpServer()).get(`${PROJECTS_BASE}/widget-app`).expect(200);
    expect(got.body.teamId).toBe("platform");

    await request(app.getHttpServer()).delete(`${PROJECTS_BASE}/widget-app`).expect(200);
  });
});
