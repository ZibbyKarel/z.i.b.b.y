import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

const BASE = "/api/skills/categories";

describe("Skill categories API (e2e)", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-cats-e2e-"));
    process.env.SKILLS_DIR = dir;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.SKILLS_DIR;
  });

  it("lists empty and is not shadowed by GET /skills/:id", async () => {
    const res = await request(app.getHttpServer()).get(BASE);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("creates a category and refuses to delete it while a skill uses it (409)", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ name: "Média", glyph: "film" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/skills")
      .send({ id: "tmdb-renamer", category: "Média", instructions: "Rename media." })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`${BASE}/${encodeURIComponent("Média")}`)
      .expect(409);

    await request(app.getHttpServer()).delete("/api/skills/tmdb-renamer").expect(200);
    await request(app.getHttpServer())
      .delete(`${BASE}/${encodeURIComponent("Média")}`)
      .expect(200);
  });
});
