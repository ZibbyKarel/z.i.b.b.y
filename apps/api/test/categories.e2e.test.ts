import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

const BASE = "/api/agents/categories";

describe("Categories API (e2e)", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "categories-e2e-"));
    process.env.AGENTS_DIR = dir;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.AGENTS_DIR;
  });

  it("lists an empty taxonomy on a fresh install — and `categories` is not shadowed by GET /agents/:id", async () => {
    const res = await request(app.getHttpServer()).get(BASE);
    // A 404 here would mean the agents `:id` route captured "categories"; the
    // categories controller must be mounted first. 200 proves the ordering.
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([]);
  });

  it("creates a category, then lists and rejects a duplicate", async () => {
    const created = await request(app.getHttpServer())
      .post(BASE)
      .send({ name: "Finance", glyph: "dollar" });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ name: "Finance", glyph: "dollar" });

    const listed = await request(app.getHttpServer()).get(BASE);
    expect(listed.body).toContainEqual({ name: "Finance", glyph: "dollar" });

    const dup = await request(app.getHttpServer())
      .post(BASE)
      .send({ name: "Finance", glyph: "cart" });
    expect(dup.status).toBe(409);
  });

  it("rejects an invalid name at the contract boundary (400)", async () => {
    await request(app.getHttpServer()).post(BASE).send({ name: "a/b", glyph: "code" }).expect(400);
    await request(app.getHttpServer()).post(BASE).send({ name: "ok", glyph: "" }).expect(400);
  });

  it("deletes an empty category and 404s on a missing one", async () => {
    await request(app.getHttpServer()).post(BASE).send({ name: "Temp", glyph: "bot" }).expect(201);
    await request(app.getHttpServer()).delete(`${BASE}/Temp`).expect(200);
    await request(app.getHttpServer()).delete(`${BASE}/Temp`).expect(404);
  });

  it("round-trips a diacritic / spaced name through encoded create + delete", async () => {
    // Category names carry diacritics and spaces, so they must survive URL
    // encoding end to end.
    const name = "Nákupy & domácnost";
    await request(app.getHttpServer()).post(BASE).send({ name, glyph: "cart" }).expect(201);
    await request(app.getHttpServer())
      .delete(`${BASE}/${encodeURIComponent(name)}`)
      .expect(200);
    expect((await request(app.getHttpServer()).get(BASE)).body).not.toContainEqual({
      name,
      glyph: "cart",
    });
  });

  it("refuses to delete a category that still has agents (409)", async () => {
    await request(app.getHttpServer()).post(BASE).send({ name: "Busy", glyph: "bot" }).expect(201);
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({
        id: "busy-agent",
        category: "Busy",
        instructions: "Do things.",
        ownerSubsystem: "forge",
      })
      .expect(201);

    const blocked = await request(app.getHttpServer()).delete(`${BASE}/Busy`);
    expect(blocked.status).toBe(409);

    // Still present after the refused delete.
    const listed = await request(app.getHttpServer()).get(BASE);
    expect(listed.body).toContainEqual({ name: "Busy", glyph: "bot" });
  });
});
