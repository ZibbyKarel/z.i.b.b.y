import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

const BASE = "/api/companies";

describe("Companies API (e2e)", () => {
  let app: INestApplication;
  let dir: string;

  const company = { id: "acme", name: "Acme Corp", desc: "A test company" };

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "companies-e2e-"));
    process.env.COMPANIES_DIR = dir;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.COMPANIES_DIR;
  });

  it("starts empty", async () => {
    expect((await request(app.getHttpServer()).get(BASE)).body).toEqual([]);
  });

  it("creates, reads, updates and deletes a company", async () => {
    const created = await request(app.getHttpServer()).post(BASE).send(company);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject(company);

    await request(app.getHttpServer()).get(`${BASE}/acme`).expect(200);

    const updated = await request(app.getHttpServer())
      .patch(`${BASE}/acme`)
      .send({ desc: "renamed" });
    expect(updated.body.desc).toBe("renamed");

    await request(app.getHttpServer()).delete(`${BASE}/acme`).expect(200);
    await request(app.getHttpServer()).get(`${BASE}/acme`).expect(404);
  });

  it("rejects a duplicate id (409) and an invalid body (400)", async () => {
    await request(app.getHttpServer()).post(BASE).send(company).expect(201);
    await request(app.getHttpServer()).post(BASE).send(company).expect(409);
    // Missing required `name` → contract 400.
    await request(app.getHttpServer()).post(BASE).send({ id: "x" }).expect(400);
    await request(app.getHttpServer()).delete(`${BASE}/acme`).expect(200);
  });

  it("404s on getting a missing company", async () => {
    await request(app.getHttpServer()).get(`${BASE}/nope`).expect(404);
  });

  it("searches companies by id/name/desc without colliding with /:id", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "globex", name: "Globex", desc: "Widgets Inc" })
      .expect(201);

    const hits = await request(app.getHttpServer()).get(`${BASE}/search?q=widgets`).expect(200);
    expect(hits.body.map((c: { id: string }) => c.id)).toEqual(["globex"]);

    // "/search" resolves to the search route, never to GET /companies/:id (→ 404).
    const empty = await request(app.getHttpServer()).get(`${BASE}/search?q=zzz`).expect(200);
    expect(empty.body).toEqual([]);

    await request(app.getHttpServer()).delete(`${BASE}/globex`).expect(200);
  });

  it("allows deleting a company even when it would still be referenced by a project", async () => {
    // Phase 69/70 decision: no cascade — the API never checks project references.
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "dangling-co", name: "Dangling Co" })
      .expect(201);
    await request(app.getHttpServer()).delete(`${BASE}/dangling-co`).expect(200);
    await request(app.getHttpServer()).get(`${BASE}/dangling-co`).expect(404);
  });

  it("backfills a missing person id on the roster and persists it on the next write", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "roster-co", name: "Roster Co", people: [{ name: "Jan Novák", role: "PM" }] })
      .expect(201);

    const got = await request(app.getHttpServer()).get(`${BASE}/roster-co`).expect(200);
    expect(got.body.people).toEqual([{ name: "Jan Novák", role: "PM", id: "jan-novak" }]);

    await request(app.getHttpServer()).patch(`${BASE}/roster-co`).send({ desc: "updated" });
    const raw = await fs.readFile(path.join(dir, "_companies.json"), "utf8");
    expect(raw).toContain("jan-novak");

    await request(app.getHttpServer()).delete(`${BASE}/roster-co`).expect(200);
  });
});
